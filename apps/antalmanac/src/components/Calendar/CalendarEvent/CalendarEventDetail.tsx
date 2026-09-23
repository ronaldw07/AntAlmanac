import { deleteCourse, deleteCustomEvent } from '$actions/AppStoreActions';
import { MapLink } from '$components/buttons/MapLink';
import { CustomEventDialog } from '$components/Calendar/Toolbar/CustomEventDialog/CustomEventDialog';
import { type CourseEvent, type CustomEvent, isCourseEvent } from '$components/Calendar/types';
import { ColorPicker } from '$components/ColorPicker';
import { useQuickSearch } from '$hooks/useQuickSearch';
import analyticsEnum, { logAnalytics } from '$lib/analytics/analytics';
import { clickToCopy } from '$lib/helpers';
import buildingCatalogue from '$lib/locations/buildingCatalogue';
import locationIds from '$lib/locations/locations';
import AppStore from '$stores/AppStore';
import { formatTimes } from '$stores/calendarizeHelpers';
import { useTimeFormatStore } from '$stores/SettingsStore';
import { Delete, Search } from '@mui/icons-material';
import { Box, Button, Chip, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { usePostHog } from 'posthog-js/react';
import { useRef } from 'react';

interface CalendarEventDetailProps {
    selectedEvent: CourseEvent | CustomEvent;
    closePopover: () => void;
    /**
     * When true, renders a compact layout in a plain Box instead of its own
     * Paper, so it can sit inline inside another surface — e.g. the mobile
     * bottom sheet — instead of floating in a Popover.
     */
    embedded?: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CalendarEventDetail({ selectedEvent, closePopover, embedded = false }: CalendarEventDetailProps) {
    const paperRef = useRef<HTMLDivElement>(null);
    const quickSearch = useQuickSearch();
    const isMilitaryTime = useTimeFormatStore((store) => store.isMilitaryTime);

    const postHog = usePostHog();

    if (isCourseEvent(selectedEvent)) {
        const { term, instructors, sectionCode, title, finalExam, locations, sectionType, deptValue, courseNumber } =
            selectedEvent;

        let finalExamString = '';

        if (finalExam.examStatus == 'NO_FINAL') {
            finalExamString = 'No Final';
        } else if (finalExam.examStatus == 'TBA_FINAL') {
            finalExamString = 'Final TBA';
        } else {
            if (finalExam.examStatus === 'SCHEDULED_FINAL') {
                const timeString = formatTimes(finalExam.startTime, finalExam.endTime, isMilitaryTime);
                const locationString = `at ${finalExam.locations
                    .map((location) => `${location.building} ${location.room}`)
                    .join(', ')}`;
                const finalExamMonth = MONTHS[finalExam.month];

                finalExamString = `${finalExam.dayOfWeek} ${finalExamMonth} ${finalExam.day} ${timeString} ${locationString}`;
            }
        }

        const handleQuickSearch = () => {
            quickSearch(deptValue, courseNumber, term);
        };

        // Tighter row spacing when embedded in the mobile bottom sheet, where
        // vertical space is at a premium.
        const cellStyle = embedded ? { padding: '1px 0', lineHeight: 1.3 } : undefined;

        const header = (
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.25rem',
                }}
            >
                <Tooltip title="Quick Search (or CMD/CTRL + Click event)">
                    <Button size="small" color="secondary" onClick={handleQuickSearch}>
                        <Search fontSize="small" style={{ marginRight: 5 }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{`${title} ${sectionType}`}</span>
                    </Button>
                </Tooltip>
                <Tooltip title="Delete">
                    <IconButton
                        size="small"
                        style={{ textDecoration: 'underline' }}
                        onClick={() => {
                            closePopover();
                            deleteCourse(sectionCode, term, AppStore.getCurrentScheduleIndex());
                            logAnalytics(postHog, {
                                category: analyticsEnum.calendar,
                                action: analyticsEnum.calendar.actions.DELETE_COURSE,
                            });
                        }}
                    >
                        <Delete fontSize="inherit" />
                    </IconButton>
                </Tooltip>
            </Box>
        );

        if (embedded) {
            const labelSx = { opacity: 0.7, mr: 0.5, fontSize: '0.72rem' };
            const valueSx = { fontSize: '0.78rem', fontWeight: 500 };

            return (
                <Box ref={paperRef}>
                    {header}
                    <Box
                        sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            columnGap: 1.5,
                            rowGap: 0.25,
                            mb: 0.5,
                        }}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography component="span" sx={labelSx}>
                                Section
                            </Typography>
                            <Tooltip title="Click to copy section code" placement="right">
                                <Chip
                                    onClick={(event) => {
                                        clickToCopy(event, sectionCode);
                                        logAnalytics(postHog, {
                                            category: analyticsEnum.calendar,
                                            action: analyticsEnum.calendar.actions.COPY_COURSE_CODE,
                                        });
                                    }}
                                    label={sectionCode}
                                    size="small"
                                    sx={{ height: 18, fontSize: '0.68rem' }}
                                />
                            </Tooltip>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography component="span" sx={labelSx}>
                                Term
                            </Typography>
                            <Typography component="span" sx={valueSx}>
                                {term.shortName}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography component="span" sx={labelSx}>
                                Final
                            </Typography>
                            <Typography component="span" sx={valueSx}>
                                {finalExamString}
                            </Typography>
                        </Box>
                        <ColorPicker
                            color={selectedEvent.color}
                            isCustomEvent={false}
                            sectionCode={sectionCode}
                            term={term}
                            analyticsCategory={analyticsEnum.calendar}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', mb: 0.25 }}>
                        <Typography component="span" sx={labelSx}>
                            Instructors
                        </Typography>
                        <Typography component="span" sx={valueSx}>
                            {instructors.join(', ')}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Typography component="span" sx={labelSx}>
                            Location{locations.length > 1 && 's'}
                        </Typography>
                        {locations.map((location) => (
                            <Box key={`${sectionCode} @ ${location.building} ${location.room}`} sx={valueSx}>
                                <MapLink
                                    buildingId={locationIds[location.building] ?? '0'}
                                    room={`${location.building} ${location.room}`}
                                />
                            </Box>
                        ))}
                    </Box>
                </Box>
            );
        }

        const content = (
            <>
                {header}
                <table
                    style={{
                        border: 'none',
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: embedded ? '0.82rem' : '0.9rem',
                    }}
                >
                    <tbody>
                        <tr>
                            <td style={{ verticalAlign: 'top', ...cellStyle }}>Section code</td>
                            <Tooltip title="Click to copy section code" placement="right">
                                <td style={{ textAlign: 'right', ...cellStyle }}>
                                    <Chip
                                        onClick={(event) => {
                                            clickToCopy(event, sectionCode);
                                            logAnalytics(postHog, {
                                                category: analyticsEnum.calendar,
                                                action: analyticsEnum.calendar.actions.COPY_COURSE_CODE,
                                            });
                                        }}
                                        label={sectionCode}
                                        size="small"
                                        sx={embedded ? { height: 20, fontSize: '0.72rem' } : undefined}
                                    />
                                </td>
                            </Tooltip>
                        </tr>
                        <tr>
                            <td style={{ verticalAlign: 'top', ...cellStyle }}>Term</td>
                            <td style={{ textAlign: 'right', ...cellStyle }}>{term.shortName}</td>
                        </tr>
                        <tr>
                            <td style={{ verticalAlign: 'top', ...cellStyle }}>Instructors</td>
                            <td style={{ whiteSpace: 'pre', textAlign: 'right', ...cellStyle }}>
                                {instructors.join('\n')}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ verticalAlign: 'top', ...cellStyle }}>
                                Location{locations.length > 1 && 's'}
                            </td>
                            <td style={{ whiteSpace: 'pre', textAlign: 'right', ...cellStyle }}>
                                {locations.map((location) => (
                                    <div key={`${sectionCode} @ ${location.building} ${location.room}`}>
                                        <MapLink
                                            buildingId={locationIds[location.building] ?? '0'}
                                            room={`${location.building} ${location.room}`}
                                        />
                                    </div>
                                ))}
                            </td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Final</td>
                            <td style={{ textAlign: 'right', ...cellStyle }}>{finalExamString}</td>
                        </tr>
                        <tr>
                            <td style={cellStyle}>Color</td>
                            <td style={{ textAlign: 'right', ...cellStyle }}>
                                <ColorPicker
                                    color={selectedEvent.color}
                                    isCustomEvent={false}
                                    sectionCode={sectionCode}
                                    term={term}
                                    analyticsCategory={analyticsEnum.calendar}
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </>
        );

        return (
            <Paper sx={{ padding: '0.5rem', minWidth: '15rem' }} ref={paperRef}>
                {content}
            </Paper>
        );
    }

    const { title, customEventID, building } = selectedEvent;
    return (
        <Paper sx={{ padding: '0.5rem' }} ref={paperRef}>
            <Box sx={{ fontSize: '0.9rem', fontWeight: 500 }}>{title}</Box>
            {building && (
                <Box sx={{ border: 'none', width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    Location:&nbsp;
                    <MapLink buildingId={+building} room={buildingCatalogue[+building]?.name ?? ''} />
                </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ColorPicker
                    color={selectedEvent.color}
                    isCustomEvent={true}
                    customEventID={selectedEvent.customEventID}
                    analyticsCategory={analyticsEnum.calendar}
                />
                <CustomEventDialog customEvent={AppStore.schedule.getExistingCustomEvent(customEventID)} />

                <Tooltip title="Delete">
                    <IconButton
                        sx={{ padding: 0.5 }}
                        onClick={() => {
                            closePopover();
                            deleteCustomEvent(customEventID, [AppStore.getCurrentScheduleIndex()]);
                            logAnalytics(postHog, {
                                category: analyticsEnum.calendar,
                                action: analyticsEnum.calendar.actions.DELETE_CUSTOM_EVENT,
                            });
                        }}
                    >
                        <Delete fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Paper>
    );
}
