import { saveSchedule, updateScheduleNote } from '$actions/AppStoreActions';
import AppStore from '$stores/AppStore';
import { useFallbackStore } from '$stores/FallbackStore';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { SCHEDULE_NOTE_MAX_LENGTH } from '@packages/antalmanac-types';
import { usePostHog } from 'posthog-js/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

function getCurrentNote(
    fallbackMode: boolean,
    getCurrentFallbackSchedule: (index: number) => { scheduleNote: string }
) {
    return fallbackMode
        ? getCurrentFallbackSchedule(AppStore.getCurrentScheduleIndex()).scheduleNote
        : AppStore.getCurrentScheduleNote();
}

export function ScheduleNoteBox() {
    const { fallbackMode, getCurrentFallbackSchedule } = useFallbackStore(
        useShallow((store) => ({
            fallbackMode: store.fallbackMode,
            getCurrentFallbackSchedule: store.getCurrentFallbackSchedule,
        }))
    );
    const postHog = usePostHog();

    const [scheduleNote, setScheduleNote] = useState(() => getCurrentNote(fallbackMode, getCurrentFallbackSchedule));
    const [persistedNote, setPersistedNote] = useState(scheduleNote);
    const [scheduleIndex, setScheduleIndex] = useState(() => AppStore.getCurrentScheduleIndex());
    const [isSaving, setIsSaving] = useState(false);

    /** Distinguishes our own edits echoing back via 'scheduleNotesChange' from external schedule loads. */
    const lastLocalEdit = useRef<string | null>(null);

    const isDirty = scheduleNote !== persistedNote;

    const writeNote = useCallback(
        (note: string) => {
            lastLocalEdit.current = note;
            setScheduleNote(note);
            updateScheduleNote(note, scheduleIndex);
        },
        [scheduleIndex]
    );

    const handleNoteChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            writeNote(event.target.value);
        },
        [writeNote]
    );

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        await saveSchedule({ postHog });
        setPersistedNote(scheduleNote);
        setIsSaving(false);
    }, [scheduleNote, postHog]);

    const handleCancel = useCallback(() => {
        writeNote(persistedNote);
    }, [persistedNote, writeNote]);

    useEffect(() => {
        const handleScheduleNoteChange = () => {
            const note = getCurrentNote(useFallbackStore.getState().fallbackMode, getCurrentFallbackSchedule);
            setScheduleNote(note);

            // An external change (schedule load, copy, import) replaces the persisted baseline.
            if (note !== lastLocalEdit.current) {
                setPersistedNote(note);
            }
        };

        const handleScheduleIndexChange = () => {
            setScheduleIndex(AppStore.getCurrentScheduleIndex());
            const note = getCurrentNote(useFallbackStore.getState().fallbackMode, getCurrentFallbackSchedule);
            lastLocalEdit.current = null;
            setScheduleNote(note);
            setPersistedNote(note);
        };

        AppStore.on('scheduleNotesChange', handleScheduleNoteChange);
        AppStore.on('currentScheduleIndexChange', handleScheduleIndexChange);

        return () => {
            AppStore.off('scheduleNotesChange', handleScheduleNoteChange);
            AppStore.off('currentScheduleIndexChange', handleScheduleIndexChange);
        };
    }, [getCurrentFallbackSchedule]);

    return (
        <Box>
            <Typography variant="h6">Schedule Notes</Typography>

            <TextField
                type="text"
                color="secondary"
                variant="filled"
                label="Click here to start typing!"
                onChange={handleNoteChange}
                value={scheduleNote}
                inputProps={{
                    maxLength: SCHEDULE_NOTE_MAX_LENGTH,
                    style: { cursor: fallbackMode ? 'not-allowed' : 'text' },
                }}
                InputLabelProps={{
                    variant: 'filled',
                }}
                InputProps={{ disableUnderline: true }}
                fullWidth
                multiline
                disabled={fallbackMode}
                sx={{
                    '& .MuiInputBase-root': {
                        cursor: fallbackMode ? 'not-allowed' : 'text',
                    },
                }}
            />

            {!fallbackMode && (
                <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ marginTop: 1 }}>
                    <Button onClick={handleCancel} color="inherit" disabled={!isDirty || isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} variant="contained" color="secondary" disabled={!isDirty || isSaving}>
                        Save
                    </Button>
                </Stack>
            )}
        </Box>
    );
}
