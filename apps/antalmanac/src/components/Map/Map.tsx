import 'leaflet/dist/leaflet.css';
import 'leaflet.locatecontrol/dist/L.Control.Locate.min.css';
import './Map.css';
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import { type CustomEventId } from '@packages/antalmanac-types';
import { isSameDay } from 'date-fns';
import { type LatLngTuple, type Map, Marker } from 'leaflet';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';

import { LocationMarker } from './Marker';
import { MobileDayStrip } from './MobileDayStrip';

const Routes = dynamic(() => import('./Routes').then((m) => ({ default: m.Routes })), { ssr: false });

import {
    isCourseEvent,
    isCustomEvent,
    type CalendarEvent,
    type CourseEvent,
    type CustomEvent,
} from '$components/Calendar/types';
import { BuildingSelect, type ExtendedBuilding } from '$components/inputs/BuildingSelect';
import { UserLocator } from '$components/Map/UserLocator';
import { useIsMobile } from '$hooks/useIsMobile';
import { useSectionThemeAssignments } from '$hooks/useSectionThemeAssignments';
import analyticsEnum, { logAnalytics } from '$lib/analytics/analytics';
import { TILES_URL } from '$lib/api/endpoints';
import buildingCatalogue, { type Building } from '$lib/locations/buildingCatalogue';
import locationIds, { buildingCodeFromLocationNumericId } from '$lib/locations/locations';
import { applyThemeToCalendarEvents } from '$lib/sectionThemes';
import { notNull } from '$lib/utils';
import AppStore from '$stores/AppStore';
import { scheduleSectionKey } from '$stores/scheduleHelpers';
import { useSelectedEventStore } from '$stores/SelectedEventStore';

function getBuildingNameAcronym(name: string): string {
    const open = name.indexOf('(');
    const close = name.indexOf(')');
    if (open === -1 || close === -1 || close <= open) {
        return '';
    }
    return name.substring(open + 1, close);
}

const ATTRIBUTION_MARKUP =
    '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors | Images from <a href="https://map.uci.edu/?id=463">UCI Map</a>';

const WORK_WEEK = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const FULL_WEEK = ['All', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekendIndices = [0, 6];
// Index-matched to Date.getDay() (0 = Sunday).
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Calendar events are calendarized onto this fixed fake week (a Monday); its
// getDay() values line up 1:1 with real Date.getDay() values, so `new
// Date(CALENDAR_STRIP_YEAR, CALENDAR_STRIP_MONTH, dayOfWeekNumber)` lands on
// the matching day of that fake week.
const CALENDAR_STRIP_YEAR = 2018;
const CALENDAR_STRIP_MONTH = 0;
// UCI's day notation ("MWF", "TuTh"), index-matched to Date.getDay().
const UCI_DAY_LETTERS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
const mondayFirst = (weekday: number) => (weekday + 6) % 7;
const CAMPUS_CENTER: LatLngTuple = [33.6459, -117.842717];
const CAMPUS_BOUND_DELTA = 0.018;
const CAMPUS_BOUNDS: [LatLngTuple, LatLngTuple] = [
    [CAMPUS_CENTER[0] - CAMPUS_BOUND_DELTA, CAMPUS_CENTER[1] - CAMPUS_BOUND_DELTA],
    [CAMPUS_CENTER[0] + CAMPUS_BOUND_DELTA, CAMPUS_CENTER[1] + CAMPUS_BOUND_DELTA],
];

interface MarkerContent {
    markerKey: string;
    image: string;
    acronym: string;
    markerColor: string;
    location: string;
}

/**
 * Get an array of courses that occur in every building.
 * Each course's info is used to render a marker to the map.
 */
export function getCoursesPerBuilding(courseEvents: CourseEvent[] = AppStore.getCourseEventsInCalendar()) {
    const courseBuildings = courseEvents.flatMap((event) => event.locations.map((location) => location.building));

    const allBuildingCodes = [...courseBuildings];

    const uniqueBuildingCodes = new Set(allBuildingCodes);

    const validBuildingCodes = [...uniqueBuildingCodes].filter(
        (buildingCode) => buildingCatalogue[locationIds[buildingCode]] != null
    );

    const coursesPerBuilding: Record<string, (CourseEvent & Building & MarkerContent)[]> = {};

    validBuildingCodes.forEach((buildingCode) => {
        coursesPerBuilding[buildingCode] = courseEvents
            .filter((event) => event.locations.map((location) => location.building).includes(buildingCode))
            .map((event) => {
                const locationData = buildingCatalogue[locationIds[buildingCode]];
                const markerKey = `${event.title} ${event.sectionType} @ ${event.locations[0]}`;
                const acronym = getBuildingNameAcronym(locationData.name);
                const markerData = {
                    markerKey,
                    image: locationData.imageURLs[0],
                    acronym,
                    markerColor: event.color,
                    location: locationData.name,
                    ...locationData,
                    ...event,
                };
                return markerData;
            });
    });

    return coursesPerBuilding;
}

export function getCustomEventPerBuilding(customEvents: CustomEvent[] = AppStore.getCustomEventsInCalendar()) {
    const customEventBuildings = customEvents.map((e) => e.building).filter(notNull);

    // convert all digit to name in customEventBuilding  for example: 83096  ->  ICS
    for (let i = 0; i < customEventBuildings.length; i++) {
        const numericId = Number.parseInt(customEventBuildings[i], 10);
        customEventBuildings[i] =
            (Number.isNaN(numericId) ? undefined : buildingCodeFromLocationNumericId(numericId)) ?? '';
    }

    const allBuildingCodes = [...customEventBuildings];

    const uniqueBuildingCodes = new Set(allBuildingCodes);

    const validBuildingCodes = [...uniqueBuildingCodes].filter(
        (buildingCode) => buildingCatalogue[locationIds[buildingCode]] != null
    );

    interface localCustomEventType {
        title: string;
        start: Date;
        end: Date;
        days: string[];
        customEventID: CustomEventId;
        color?: string | undefined;
        building?: string | undefined;
    }

    const customEventPerBuilding: Record<string, (localCustomEventType & Building & MarkerContent)[]> = {};
    for (let i = 0; i < validBuildingCodes.length; i++) {
        customEventPerBuilding[validBuildingCodes[i]] = customEvents
            .filter((event) => {
                const raw = event.building ?? '';
                const numericId = Number.parseInt(raw, 10);
                const code =
                    raw === '' || Number.isNaN(numericId) ? undefined : buildingCodeFromLocationNumericId(numericId);
                return code === validBuildingCodes[i];
            })
            .map((event) => {
                const locationData = buildingCatalogue[locationIds[validBuildingCodes[i]]];
                const markerKey = `${event.title} @ ${event.building}`;
                const acronym = getBuildingNameAcronym(locationData.name);
                const markerCustomEventData = {
                    markerKey,
                    image: locationData.imageURLs[0],
                    acronym,
                    markerColor: event.color ? event.color : '',
                    location: locationData.name,
                    ...locationData,
                    ...event,
                };
                return markerCustomEventData;
            });
    }
    return customEventPerBuilding;
}

/**
 * Map of all course locations on UCI campus.
 */
export function CourseMap() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const map = useRef<Map | null>(null);
    const markerRef = useRef<Marker | null>(null);
    const classMarkerRefs = useRef(new globalThis.Map<string, Marker>());
    const isMobile = useIsMobile();
    const [selectedDayIndex, setSelectedDay] = useState(() => {
        if (!isMobile) {
            return 0;
        }
        // On mobile, land on today's day tab instead of "All" so the strip
        // (which needs one specific day) isn't empty on open.
        const todayAbbreviation = WEEKDAY_ABBREVIATIONS[new Date().getDay()];
        const workWeekIndex = WORK_WEEK.indexOf(todayAbbreviation);
        return workWeekIndex === -1 ? WORK_WEEK.indexOf('Mon') : workWeekIndex;
    });
    const lastHandledClickKeyRef = useRef<string | null>(null);
    const [pendingPopupSectionKey, setPendingPopupSectionKey] = useState<string | null>(null);

    const selectedEvent = useSelectedEventStore((state) => state.selectedEvent);

    const [rawCalendarEvents, setRawCalendarEvents] = useState(() => AppStore.getEventsInCalendar());

    const { setting, palette, assignments } = useSectionThemeAssignments();

    const themedEvents = useMemo<CalendarEvent[]>(
        () => applyThemeToCalendarEvents(rawCalendarEvents, setting, assignments, palette),
        [rawCalendarEvents, setting, assignments, palette]
    );

    const calendarEvents = themedEvents;

    const markers = useMemo(() => getCoursesPerBuilding(themedEvents.filter(isCourseEvent)), [themedEvents]);
    const customEventMarkers = useMemo(
        () => getCustomEventPerBuilding(themedEvents.filter(isCustomEvent)),
        [themedEvents]
    );
    const postHog = usePostHog();

    useEffect(() => {
        logAnalytics(postHog, {
            category: analyticsEnum.map,
            action: analyticsEnum.map.actions.OPEN,
        });
    }, [postHog]);

    useEffect(() => {
        const updateFromStore = () => {
            setRawCalendarEvents(AppStore.getEventsInCalendar());
        };

        AppStore.on('addedCoursesChange', updateFromStore);
        AppStore.on('customEventsChange', updateFromStore);
        AppStore.on('currentScheduleIndexChange', updateFromStore);
        AppStore.on('colorChange', updateFromStore);

        return () => {
            AppStore.removeListener('addedCoursesChange', updateFromStore);
            AppStore.removeListener('customEventsChange', updateFromStore);
            AppStore.removeListener('currentScheduleIndexChange', updateFromStore);
            AppStore.removeListener('colorChange', updateFromStore);
        };
    }, []);

    useEffect(() => {
        const locationID = Number(searchParams.get('location') ?? 0);
        const building = locationID in buildingCatalogue ? buildingCatalogue[locationID] : undefined;

        if (building == null) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            map.current?.flyTo([building.lat + 0.001, building.lng], 18, { duration: 250, animate: false });
            markerRef.current?.openPopup();
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [searchParams]);

    const handleChange = useCallback(
        (_event: React.SyntheticEvent, newValue: number) => {
            setSelectedDay(newValue);
        },
        [setSelectedDay]
    );

    const onBuildingChange = useCallback(
        (building?: ExtendedBuilding | null) => {
            router.push(building ? `/map?location=${building.id}` : '/map');
        },
        [router]
    );

    const days = useMemo(() => {
        const hasWeekendEvent = calendarEvents.some((event) => weekendIndices.includes(event.start.getDay()));
        return hasWeekendEvent ? FULL_WEEK : WORK_WEEK;
    }, [calendarEvents]);

    const today = useMemo(() => {
        return days[selectedDayIndex];
    }, [days, selectedDayIndex]);

    /**
     * Course events for the mobile bottom class strip, in order: the selected
     * day's classes, or on "All" one entry per class (its first meeting of the
     * week).
     */
    const stripDayEvents = useMemo(() => {
        const courseEvents = calendarEvents.filter(isCourseEvent).sort((a, b) => a.start.getTime() - b.start.getTime());

        if (today === 'All') {
            return courseEvents.filter(
                (event, index) =>
                    courseEvents.findIndex(
                        (other) =>
                            scheduleSectionKey(other.term, other.sectionCode) ===
                            scheduleSectionKey(event.term, event.sectionCode)
                    ) === index
            );
        }

        const dayDate = new Date(CALENDAR_STRIP_YEAR, CALENDAR_STRIP_MONTH, WEEKDAY_ABBREVIATIONS.indexOf(today));
        return courseEvents.filter((event) => isSameDay(event.start, dayDate));
    }, [calendarEvents, today]);

    /** On "All", each class's meeting days (e.g. "MWF"), keyed by section, to label its strip chip. */
    const stripDaysBySection = useMemo(() => {
        if (today !== 'All') {
            return undefined;
        }

        const weekdaysBySection: Record<string, number[]> = {};
        for (const event of calendarEvents.filter(isCourseEvent)) {
            const key = scheduleSectionKey(event.term, event.sectionCode);
            const weekday = event.start.getDay();
            const weekdays = weekdaysBySection[key] ?? [];
            if (!weekdays.includes(weekday)) {
                weekdaysBySection[key] = [...weekdays, weekday];
            }
        }

        return Object.fromEntries(
            Object.entries(weekdaysBySection).map(([key, weekdays]) => [
                key,
                [...weekdays]
                    .sort((a, b) => mondayFirst(a) - mondayFirst(b))
                    .map((weekday) => UCI_DAY_LETTERS[weekday])
                    .join(''),
            ])
        );
    }, [calendarEvents, today]);

    const focusedLocation = useMemo(() => {
        const locationID = Number(searchParams.get('location') ?? 0);

        const focusedBuilding = locationID in buildingCatalogue ? buildingCatalogue[locationID] : undefined;

        if (focusedBuilding == null) {
            return undefined;
        }

        const acronym = getBuildingNameAcronym(focusedBuilding.name);

        return {
            ...focusedBuilding,
            image: focusedBuilding.imageURLs[0],
            acronym,
            location: focusedBuilding.name,
        };
    }, [searchParams]);

    /**
     * Get markers for unique courses (identified by term + section code) that occur today, sorted by start time.
     * A duplicate section found later in the array will have a higher index.
     */
    const markersToDisplay = useMemo(() => {
        const markerValues = Object.keys(markers).flatMap((markerKey) => markers[markerKey]);

        const markersToday =
            today === 'All' ? markerValues : markerValues.filter((course) => course.start.toString().includes(today));

        return markersToday
            .sort((a, b) => a.start.getTime() - b.start.getTime())
            .filter(
                (marker, i, arr) =>
                    arr.findIndex(
                        (other) =>
                            scheduleSectionKey(other.term, other.sectionCode) ===
                            scheduleSectionKey(marker.term, marker.sectionCode)
                    ) === i
            );
    }, [markers, today]);

    /**
     * When a class is clicked on the calendar: switch the map's day filter to
     * match that class's day (unless it's on "All"), and fly to its building
     * right away. The lookup
     * uses the full, unfiltered `markers` map (not the day-filtered
     * `markersToDisplay`) so it doesn't have to wait for the day switch above
     * to be re-rendered first — doing so previously raced the two effects and
     * caused clicks after the first to miss, land on stale data, or re-fire
     * repeatedly. `lastHandledClickKeyRef` dedupes by (section, day) so the
     * effect only acts once per distinct click — a class that meets on
     * multiple days is a different click per day and must still switch the
     * day tab each time, even though its section key repeats.
     */
    useEffect(() => {
        if (!selectedEvent || !isCourseEvent(selectedEvent)) {
            return;
        }

        const sectionKey = scheduleSectionKey(selectedEvent.term, selectedEvent.sectionCode);
        const eventDay = WEEKDAY_ABBREVIATIONS[selectedEvent.start.getDay()];
        const clickKey = `${sectionKey}|${eventDay}`;

        if (clickKey === lastHandledClickKeyRef.current) {
            return;
        }
        lastHandledClickKeyRef.current = clickKey;

        // "All" already shows every class, so stay on it rather than jumping
        // to the clicked class's day.
        const isAllTab = days[selectedDayIndex] === 'All';
        const dayIndex = days.indexOf(eventDay);

        if (!isAllTab && dayIndex !== -1 && dayIndex !== selectedDayIndex) {
            setSelectedDay(dayIndex);
        }

        // On "All" there's one marker per section, so fly to that one — it's
        // where the popup will open. Otherwise match on the clicked
        // occurrence's day too, not just its section: a section that meets in
        // two different buildings on different days must fly to the building
        // for the day actually clicked, not whichever building happens to
        // come first in `markers`.
        const marker = isAllTab
            ? markersToDisplay.find(
                  (candidate) => scheduleSectionKey(candidate.term, candidate.sectionCode) === sectionKey
              )
            : Object.keys(markers)
                  .flatMap((markerKey) => markers[markerKey])
                  .find(
                      (candidate) =>
                          scheduleSectionKey(candidate.term, candidate.sectionCode) === sectionKey &&
                          candidate.start.getDay() === selectedEvent.start.getDay()
                  );

        if (!marker) {
            return;
        }

        // flyTo's `duration` is in seconds, not ms. The popup's own autoPan
        // (see Marker.tsx) nudges the map afterward if the card would be
        // covered by the day-tabs bar or the mobile day strip.
        map.current?.flyTo([marker.lat, marker.lng], 18, { duration: 0.25 });
        setPendingPopupSectionKey(sectionKey);
    }, [selectedEvent, days, selectedDayIndex, markers, markersToDisplay]);

    /**
     * Opens the popup for the clicked class once its marker has mounted for
     * the now-selected day — it may not exist yet on the render where the
     * day filter above just switched.
     */
    useEffect(() => {
        if (!pendingPopupSectionKey) {
            return;
        }

        const marker = classMarkerRefs.current.get(pendingPopupSectionKey);

        if (!marker) {
            return;
        }

        // A freshly-mounted marker isn't fully attached to the Leaflet map yet on
        // the same tick — openPopup() is a silent no-op if called immediately.
        const timeoutId = window.setTimeout(() => {
            marker.openPopup();
            setPendingPopupSectionKey(null);
        }, 250);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [pendingPopupSectionKey, markersToDisplay]);

    const customEventMarkersToDisplay = useMemo(() => {
        const markerValues = Object.keys(customEventMarkers)
            .flatMap((markerKey) => customEventMarkers[markerKey])
            .filter((marker, i, arr) => arr.findIndex((other) => other.markerKey === marker.markerKey) === i);

        const markersToday =
            today === 'All'
                ? markerValues
                : markerValues.filter((event) => {
                      return event.days.some((day) => day && today.includes(day));
                  });

        return markersToday.sort((a, b) => {
            const startDateA = new Date(`1970-01-01T${a.start}`);
            const startDateB = new Date(`1970-01-01T${b.start}`);
            return startDateA.getTime() - startDateB.getTime();
        });
    }, [customEventMarkers, today]);

    /**
     * Every two markers grouped as [start, destination] tuples for the routes.
     */
    const startDestPairs = useMemo(() => {
        const allEvents = [...markersToDisplay, ...customEventMarkersToDisplay];
        return allEvents.reduce(
            (acc, cur, index) => {
                acc.push([cur]);
                if (index > 0) {
                    acc[index - 1].push(cur);
                }
                return acc;
            },
            [] as (typeof allEvents)[]
        );
    }, [markersToDisplay, customEventMarkersToDisplay]);

    // Derive stable route descriptors from `startDestPairs` so `latLngTuples`
    // keeps the same array identity across renders that don't actually change
    // the route. Routes.tsx's effect depends on that identity to decide when
    // to rebuild its (async) Leaflet routing control; rebuilding on every
    // unrelated render races a stale in-flight request against a torn-down
    // control and crashes leaflet-routing-machine.
    const routes = useMemo(
        () =>
            startDestPairs.map((startDestPair, pairIndex) => {
                const latLngTuples = startDestPair.map((marker) => [marker.lat, marker.lng] as LatLngTuple);
                const latLngKey = latLngTuples.map((t) => `${t[0]},${t[1]}`).join('|');
                return {
                    key: `route-${pairIndex}-${latLngKey}`,
                    latLngTuples,
                    color: startDestPair[0]?.color,
                };
            }),
        [startDestPairs]
    );

    return (
        <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }} id="map-pane">
                <MapContainer
                    ref={map}
                    center={CAMPUS_CENTER}
                    zoom={16}
                    style={{ height: '100%' }}
                    maxBounds={CAMPUS_BOUNDS}
                    maxBoundsViscosity={1}
                >
                    {/* Menu floats above the map. */}
                    <Paper sx={{ position: 'relative', mx: 'auto', my: 2, width: '70%', zIndex: 400 }}>
                        <Tabs
                            value={selectedDayIndex}
                            onChange={handleChange}
                            variant="fullWidth"
                            sx={{ minHeight: 0 }}
                            textColor="secondary"
                            indicatorColor="secondary"
                        >
                            {days.map((day) => (
                                <Tab key={day} label={day} sx={{ padding: 1, minHeight: 'auto', minWidth: '10%' }} />
                            ))}
                        </Tabs>
                        <BuildingSelect
                            value={searchParams.get('location') ?? undefined}
                            onChange={onBuildingChange}
                            variant="filled"
                        />
                    </Paper>

                    <TileLayer
                        attribution={ATTRIBUTION_MARKUP}
                        url={`https://${TILES_URL}/{z}/{x}/{y}.png`}
                        tileSize={512}
                        maxZoom={21}
                        minZoom={15}
                        zoomOffset={-1}
                    />

                    <UserLocator />

                    {/* Draw out routes if the user is viewing a specific day. */}
                    {today !== 'All' &&
                        routes.map(({ key, latLngTuples, color }) => (
                            <Routes key={key} latLngTuples={latLngTuples} color={color} />
                        ))}

                    {/* Draw a marker for each class that occurs today. */}
                    {(() => {
                        const stackCountByPrimaryBuilding: Record<string, number> = {};
                        return markersToDisplay.map((marker, index) => {
                            const primaryBuilding = marker.locations[0].building;
                            const stackIndex = stackCountByPrimaryBuilding[primaryBuilding] ?? 0;
                            stackCountByPrimaryBuilding[primaryBuilding] = stackIndex + 1;

                            const allRoomsInBuilding = marker.locations
                                .filter((location) => location.building === primaryBuilding)
                                .reduce((roomList, location) => [...roomList, location.room], [] as string[]);

                            const sectionKey = scheduleSectionKey(marker.term, marker.sectionCode);

                            return (
                                <Fragment key={sectionKey}>
                                    <LocationMarker
                                        {...marker}
                                        label={today === 'All' ? undefined : (index + 1).toString()}
                                        stackIndex={stackIndex}
                                        ref={(instance) => {
                                            if (instance) {
                                                classMarkerRefs.current.set(sectionKey, instance);
                                            } else {
                                                classMarkerRefs.current.delete(sectionKey);
                                            }
                                        }}
                                    >
                                        <Box>
                                            <Typography variant="body2">
                                                <span style={{ fontWeight: 'bold' }}>Class:</span> {marker.title}{' '}
                                                {marker.sectionType}
                                            </Typography>
                                            <Typography variant="body2">
                                                <span style={{ fontWeight: 'bold' }}>
                                                    Room{allRoomsInBuilding.length > 1 && 's'}:
                                                </span>{' '}
                                                {marker.locations[0].building} {allRoomsInBuilding.join('/')}
                                            </Typography>
                                        </Box>
                                    </LocationMarker>
                                </Fragment>
                            );
                        });
                    })()}

                    {/* Draw a marker for each custom Event that occurs today. */}
                    {customEventMarkersToDisplay.map((customEventMarkers, index) => {
                        const customEventSameBuildingPrior = customEventMarkersToDisplay.slice(0, index);

                        return (
                            <Fragment key={customEventMarkers.markerKey}>
                                <LocationMarker
                                    {...customEventMarkers}
                                    label={'E'}
                                    stackIndex={customEventSameBuildingPrior.length}
                                >
                                    <Box>
                                        <Typography variant="body2">
                                            <span style={{ fontWeight: 'bold' }}>Event:</span>{' '}
                                            {customEventMarkers.title}
                                        </Typography>
                                    </Box>
                                </LocationMarker>
                            </Fragment>
                        );
                    })}

                    {/* Render an additional marker if the user searched up a location. */}
                    {/* A unique key based on the building is used to make sure the previous marker un-renders. */}
                    {focusedLocation && (
                        <LocationMarker
                            key={focusedLocation.name}
                            {...focusedLocation}
                            label="!"
                            color="red"
                            location={focusedLocation.name}
                            image={focusedLocation.imageURLs?.[0]}
                            ref={markerRef}
                        />
                    )}
                </MapContainer>
            </Box>

            {isMobile && <MobileDayStrip events={stripDayEvents} daysBySection={stripDaysBySection} />}
        </Box>
    );
}
