import { saveSchedule, updateScheduleNote } from '$actions/AppStoreActions';
import AppStore from '$stores/AppStore';
import { useFallbackStore } from '$stores/FallbackStore';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { SCHEDULE_NOTE_MAX_LENGTH } from '@packages/antalmanac-types';
import { usePostHog } from 'posthog-js/react';
import { useCallback, useEffect, useState } from 'react';
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

    const [savedNote, setSavedNote] = useState(() => getCurrentNote(fallbackMode, getCurrentFallbackSchedule));
    const [draftNote, setDraftNote] = useState(savedNote);
    const [scheduleIndex, setScheduleIndex] = useState(() => AppStore.getCurrentScheduleIndex());
    const [isSaving, setIsSaving] = useState(false);

    const isDirty = draftNote !== savedNote;

    const handleNoteChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDraftNote(event.target.value);
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        updateScheduleNote(draftNote, scheduleIndex);
        setSavedNote(draftNote);
        await saveSchedule({ postHog });
        setIsSaving(false);
    }, [draftNote, scheduleIndex, postHog]);

    const handleCancel = useCallback(() => {
        setDraftNote(savedNote);
    }, [savedNote]);

    useEffect(() => {
        const handleScheduleNoteChange = () => {
            const note = getCurrentNote(useFallbackStore.getState().fallbackMode, getCurrentFallbackSchedule);
            setSavedNote(note);
            setDraftNote(note);
        };

        const handleScheduleIndexChange = () => {
            setScheduleIndex(AppStore.getCurrentScheduleIndex());
            const note = getCurrentNote(useFallbackStore.getState().fallbackMode, getCurrentFallbackSchedule);
            setSavedNote(note);
            setDraftNote(note);
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
                value={draftNote}
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
