import buildingCatalogue, { type Building } from '$lib/locations/buildingCatalogue';
import { Autocomplete, TextField, type TextFieldProps } from '@mui/material';
import { useCallback, useMemo } from 'react';

export interface ExtendedBuilding extends Building {
    id: string;
}

/**
 * Get unique building names for the MUI Autocomplete.
 * When multiple catalogue entries share a name, keep the first one encountered.
 */
const buildings: ExtendedBuilding[] = (() => {
    const byName = new Map<string, ExtendedBuilding>();

    for (const [id, building] of Object.entries(buildingCatalogue)) {
        if (!byName.has(building.name)) {
            byName.set(building.name, { id, ...building });
        }
    }

    return [...byName.values()];
})();

type BuildingSelectProps = {
    value?: string;
    onChange?: (building?: ExtendedBuilding | null) => unknown;
    variant?: TextFieldProps['variant'];
};

export function BuildingSelect(props: BuildingSelectProps) {
    const { onChange, variant = 'standard' } = props;
    const handleChange = useCallback(
        async (_event: React.SyntheticEvent, value: ExtendedBuilding | null) => {
            await onChange?.(value);
        },
        [onChange]
    );

    const value = useMemo(() => {
        if (props.value == null) {
            return;
        }

        const building = buildingCatalogue[Number(props.value)];

        return {
            id: props.value,
            ...building,
        };
    }, [props.value]);

    return (
        <Autocomplete
            options={buildings}
            value={value}
            isOptionEqualToValue={(option, value) => option.id === value?.id}
            getOptionLabel={(option) => option.name ?? ''}
            onChange={handleChange}
            sx={{
                // Default icon padding is too tight a touch target on mobile —
                // a real tap easily lands just outside it and misses.
                '& .MuiAutocomplete-clearIndicator, & .MuiAutocomplete-popupIndicator': {
                    padding: '10px',
                },
                // A little breathing room so a tap can't land on the wrong
                // one of the two adjacent icons.
                '& .MuiAutocomplete-endAdornment': {
                    display: 'flex',
                    gap: '4px',
                },
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Search for a place"
                    variant={variant}
                    InputLabelProps={{ variant: variant }}
                    color="secondary"
                />
            )}
        />
    );
}
