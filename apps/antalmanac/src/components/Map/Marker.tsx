import { useIsMobile } from '$hooks/useIsMobile';
import analyticsEnum, { logAnalytics } from '$lib/analytics/analytics';
import { DirectionsWalk as DirectionsWalkIcon, Info } from '@mui/icons-material';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { type Marker, type PointTuple, divIcon } from 'leaflet';
import { usePostHog } from 'posthog-js/react';
import { type Ref, forwardRef } from 'react';
import { Popup, Marker as ReactLeafletMarker } from 'react-leaflet';

const GOOGLE_MAPS_URL = 'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=';
// On mobile, keep the popup clear of the day-tabs bar above and the class sheet below.
const MOBILE_POPUP_PADDING_TOP_LEFT: PointTuple = [10, 170];
const MOBILE_POPUP_PADDING_BOTTOM_RIGHT: PointTuple = [10, 190];
const IMAGE_CMS_URL = 'https://cms.concept3d.com/map/lib/image-cache/i.php?mapId=463&image=';

/**
 * returns a leaflet DivIcon that can replace the marker's default blue icon
 */
function getMarkerIcon(color = '', stackIndex = 1, label = '') {
    return divIcon({
        /**
         * Adds offset to __marker__ for stacking markers.
         */
        iconAnchor: [0, 14 + 16 * stackIndex],

        /**
         * Adds offset to __popup__ for stacking markers.
         */
        popupAnchor: [0, -21 - 16 * stackIndex],

        /**
         * Removes styling added by leaflet classes.
         */
        className: '',

        /**
         * what the marker will look like
         */
        html: `<div style="position:relative;">
             <span style="background-color: ${color};
                   width: 1.75rem;
                   height: 1.75rem;
                   display: block;
                   left: -1rem;
                   top: -1rem;
                   position: absolute;
                   border-radius: 1.9rem 1.9rem 0;
                   transform: rotate(45deg);
                   border: 1px solid #FFFFFF">
             </span>
             <div style="position: absolute;
                         width: 1.75rem;
                         height: 1.75rem;
                         left: -1rem;
                         top: -0.75rem;
                         text-align: center; 
                         color: white" >
                   ${label || ''}
             </div>
           </div>`,
    });
}

interface Props {
    lat: number;
    lng: number;
    color?: string;
    image?: string;
    location?: string;
    acronym?: string;
    stackIndex?: number;
    label?: string;
    children?: React.ReactNode;
}

/**
 * Custom map marker + popup with course info.
 */
export const LocationMarker = forwardRef(
    ({ lat, lng, color, image, location, acronym, stackIndex, label, children }: Props, ref?: Ref<Marker>) => {
        const postHog = usePostHog();
        const isMobile = useIsMobile();

        return (
            <ReactLeafletMarker
                ref={ref}
                position={[lat, lng]}
                icon={getMarkerIcon(color, stackIndex, label)}
                zIndexOffset={stackIndex}
                eventHandlers={{
                    click: () => {
                        logAnalytics(postHog, {
                            category: analyticsEnum.map,
                            action: analyticsEnum.map.actions.CLICK_PIN,
                        });
                    },
                }}
            >
                <Popup
                    autoPanPaddingTopLeft={isMobile ? MOBILE_POPUP_PADDING_TOP_LEFT : undefined}
                    autoPanPaddingBottomRight={isMobile ? MOBILE_POPUP_PADDING_BOTTOM_RIGHT : undefined}
                >
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            width: isMobile ? 190 : 250,
                        }}
                    >
                        {image && (
                            <Box
                                height={isMobile ? 80 : 150}
                                borderRadius={'0.75rem 0.75rem 0 0'}
                                component="img"
                                src={`${IMAGE_CMS_URL}${image}`}
                                alt="Building Snapshot"
                                sx={{
                                    objectFit: 'cover',
                                }}
                            />
                        )}

                        <Box
                            display="flex"
                            flexDirection="column"
                            mx={isMobile ? 1.25 : 2}
                            my={isMobile ? 0.75 : 1.25}
                            gap={isMobile ? 0.5 : 1}
                        >
                            <Box display="flex" flexDirection="column" gap={isMobile ? 0.25 : 0.5}>
                                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                                    <Typography
                                        fontSize={isMobile ? '0.95rem' : '1.25rem'}
                                        lineHeight={isMobile ? 1.2 : 1.25}
                                        fontWeight={600}
                                    >
                                        {location}
                                    </Typography>
                                    {location && (
                                        <IconButton
                                            href={`http://www.classrooms.uci.edu/classrooms/${acronym}`}
                                            target="_blank"
                                            size={isMobile ? 'small' : 'medium'}
                                            aria-label="Classroom info"
                                            sx={{ padding: 0 }}
                                        >
                                            <Info fontSize={isMobile ? 'small' : 'large'} color="primary" />
                                        </IconButton>
                                    )}
                                </Box>

                                {children}
                            </Box>

                            <Button
                                variant="contained"
                                color="primary"
                                size={isMobile ? 'small' : 'medium'}
                                startIcon={
                                    <DirectionsWalkIcon sx={{ color: (theme) => theme.vars.palette.common.white }} />
                                }
                                href={`${GOOGLE_MAPS_URL}${lat},${lng}`}
                                target="_blank"
                                sx={{
                                    alignSelf: 'center',
                                    width: '100%',
                                    borderRadius: '0.75rem',
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: isMobile ? '0.9rem' : '1.25rem',
                                        letterSpacing: isMobile ? 0.75 : 1.25,
                                        fontWeight: 500,
                                        color: (theme) => theme.vars.palette.common.white,
                                    }}
                                >
                                    Directions
                                </Typography>
                            </Button>
                        </Box>
                    </Box>
                </Popup>
            </ReactLeafletMarker>
        );
    }
);

LocationMarker.displayName = 'LocationMarker';
