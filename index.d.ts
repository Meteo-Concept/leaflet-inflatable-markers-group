// Type definitions for Leaflet.InflatableMarkersGroup v0
// Project: LeafletInflatableMarkersLayer
// Definitions by: Laurent Georget <https://github.com/meteoconcept>
// TypeScript Version: 2.3

import * as L from 'leaflet';

declare module 'leaflet' {
    class InflatableMarker extends L.Marker {
        baseMarker: L.Marker;
        constructor(latlng: L.LatLngExpression, group: InflatableMarkersGroup, baseMarker: L.Marker);
        getInflatedSize(): L.Point;
        createIcon(): HTMLElement;
        createShadow(): HTMLElement|null;
        redraw(): void;
        toggle(): void;
        isInflated(): boolean;
    }

    interface InflatableMarkersGroupOptions extends L.LayerOptions {
        obstructionSize?: L.Point;
        iconCreateFunction(InflatableMarker): L.DivIcon;
        groupPane?: string;
    }

    class InflatableMarkersGroup extends L.FeatureGroup {
        constructor(InflatableMarkersGroupOptions);
        inflateAsMayAsPossible(reset?: boolean): void;
        deflateAll(): void;
        toggleInflatedMarkersAbove(): void;
        makeAwareOfOtherGroup(): void;
        removeOtherGroup(): void;
    }

    function inflatableMarkersGroup(options?: InflatableMarkersGroupOptions): InflatableMarkersGroup;
}
