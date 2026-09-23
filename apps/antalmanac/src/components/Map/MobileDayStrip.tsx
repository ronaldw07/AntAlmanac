'use client';

import { CalendarEventDetail } from '$components/Calendar/CalendarEvent/CalendarEventDetail';
import { type CourseEvent, isCourseEvent } from '$components/Calendar/types';
import { scheduleSectionKey } from '$stores/scheduleHelpers';
import { useSelectedEventStore } from '$stores/SelectedEventStore';
import { ExpandMore } from '@mui/icons-material';
import { Box, Collapse, Divider, Paper, Typography, useTheme } from '@mui/material';
import { format } from 'date-fns';
import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

interface MobileDayStripProps {
    events: CourseEvent[];
    /** Set on the "All" tab: each class's meeting days (e.g. "MWF"), keyed by section. */
    daysBySection?: Record<string, string>;
}

const SCROLL_END_TOLERANCE_PX = 1;

/**
 * Mobile map bottom sheet: one panel holding the selected day's classes (or,
 * on "All", every class once, labeled with its meeting days) as a
 * horizontally-scrollable chip row. Tapping a chip expands its details inline
 * above the row, in the same panel, and drives the same `useSelectedEventStore`
 * the desktop calendar click handler uses, so it also triggers the map's
 * jump-to-class effect. Tapping the active chip again collapses it.
 */
export function MobileDayStrip({ events, daysBySection }: MobileDayStripProps) {
    const [selectedEvent, setSelectedEvent] = useSelectedEventStore(
        useShallow((state) => [state.selectedEvent, state.setSelectedEvent])
    );
    const containerRef = useRef<HTMLDivElement>(null);
    const theme = useTheme();
    const [canScrollRight, setCanScrollRight] = useState(false);

    const activeEvent = useMemo(() => {
        if (!selectedEvent || !isCourseEvent(selectedEvent)) {
            return null;
        }
        const activeKey = scheduleSectionKey(selectedEvent.term, selectedEvent.sectionCode);
        // On "All" each class has a single chip, so any meeting of it matches.
        return (
            events.find(
                (event) =>
                    scheduleSectionKey(event.term, event.sectionCode) === activeKey &&
                    (daysBySection !== undefined || event.start.getDay() === selectedEvent.start.getDay())
            ) ?? null
        );
    }, [selectedEvent, events, daysBySection]);

    // Collapse needs content to animate closed against. Keep showing the last
    // active event's details while it collapses, and only clear them once the
    // collapse animation actually finishes.
    const [displayedEvent, setDisplayedEvent] = useState<CourseEvent | null>(null);
    useEffect(() => {
        if (activeEvent) {
            setDisplayedEvent(activeEvent);
        }
    }, [activeEvent]);

    const updateScrollFade = () => {
        const el = containerRef.current;
        if (!el) return;
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - SCROLL_END_TOLERANCE_PX);
    };

    useEffect(() => {
        updateScrollFade();
    }, [events]);

    if (events.length === 0) {
        return null;
    }

    const handleChipClick = (mouseEvent: MouseEvent<HTMLButtonElement>, event: CourseEvent) => {
        if (activeEvent === event) {
            setSelectedEvent(null, null);
            return;
        }
        setSelectedEvent(mouseEvent, event);
    };

    return (
        <Paper
            sx={{
                position: 'absolute',
                bottom: 'calc(60px + env(safe-area-inset-bottom))',
                left: 12,
                right: 12,
                zIndex: 450,
                borderRadius: '16px',
                p: 0.75,
                overflow: 'hidden',
            }}
        >
            {activeEvent && (
                <Box
                    component="button"
                    onClick={() => setSelectedEvent(null, null)}
                    aria-label="Collapse class details"
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        color: 'text.secondary',
                        cursor: 'pointer',
                        mb: 0.25,
                        lineHeight: 0,
                    }}
                >
                    <ExpandMore fontSize="small" />
                </Box>
            )}

            <Collapse in={Boolean(activeEvent)} onExited={() => setDisplayedEvent(null)}>
                {displayedEvent && (
                    <>
                        <CalendarEventDetail
                            embedded
                            selectedEvent={displayedEvent}
                            closePopover={() => setSelectedEvent(null, null)}
                        />
                        <Divider sx={{ my: 0.5 }} />
                    </>
                )}
            </Collapse>

            <Box sx={{ position: 'relative' }}>
                <Box
                    ref={containerRef}
                    onScroll={updateScrollFade}
                    sx={{
                        display: 'flex',
                        gap: 1,
                        overflowX: 'auto',
                        overflowY: 'hidden',
                    }}
                >
                    {events.map((event) => {
                        const location = event.locations[0];

                        return (
                            <Box
                                key={`${event.term.shortName}-${event.sectionCode}-${event.start.getTime()}`}
                                component="button"
                                onClick={(mouseEvent: MouseEvent<HTMLButtonElement>) =>
                                    handleChipClick(mouseEvent, event)
                                }
                                sx={{
                                    flexShrink: 0,
                                    textAlign: 'left',
                                    border: activeEvent === event ? '2px solid white' : 'none',
                                    borderRadius: 2,
                                    boxShadow: 4,
                                    px: 1.5,
                                    py: 1,
                                    minWidth: 120,
                                    bgcolor: event.color,
                                    color: 'white',
                                    cursor: 'pointer',
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    sx={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap' }}
                                >
                                    {daysBySection &&
                                        `${daysBySection[scheduleSectionKey(event.term, event.sectionCode)]} `}
                                    {format(event.start, 'h:mm a')} – {format(event.end, 'h:mm a')}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                    {event.title}
                                </Typography>
                                {location && (
                                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.9 }}>
                                        {location.building} {location.room}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
                {canScrollRight && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            right: 0,
                            width: 32,
                            pointerEvents: 'none',
                            background: `linear-gradient(to right, transparent, ${theme.vars.palette.background.paper})`,
                        }}
                    />
                )}
            </Box>
        </Paper>
    );
}
