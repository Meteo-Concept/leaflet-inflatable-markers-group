(function (factory, window) {
    if (typeof define === 'function' && define.amd) {
        define(['leaflet'], function (L) {
            factory(L);
        });
    } else if (typeof exports === 'object') {
        module.exports = function (L) {
            if (L === undefined) {
                L = require('leaflet');
            }
            factory(L);
            return L;
        };
    } else if (typeof window !== 'undefined' && window.L) {
        factory(window.L);
    }
}(function leafletInflatableMarkersGroupFactory(L) {

    const INFLATED_MARKERS_ZINDEX_OFFSET = 10000;

    const DEFLATED_MARKERS_ZINDEX_OFFSET = 20000;

    const InflatableMarker = L.InflatableMarker = L.Marker.extend({

        options: L.Icon.prototype.options,

        initialize: function (latlng, group, baseMarker) {
            L.Util.setOptions(this, baseMarker.options);
            this.options.pane = group.options.pane;
            // hijack the icon drawing process
            this.options._inflatedIcon = this.options.icon;
            this.options.icon = this;

            this.baseMarker = baseMarker;
            this.addEventParent(this.baseMarker);
            this._latlng = latlng;
            this._group = group;
            this._obstructiveMarkers = new Set();
            this._inflated = false;
            this._iconNeedsUpdate = true;
            this._savedZIndexOffset = this.options.zIndexOffset;

            this.on("contextmenu", this.toggle, this);
        },

        getInflatedSize: function() {
            const iconOptions = this.options._inflatedIcon.options;
            if (!(iconOptions.iconSize instanceof L.Point))
                iconOptions.iconSize = L.point(iconOptions.iconSize);
            return iconOptions.iconSize;
        },

        createIcon: function () {
            this._iconObj = this._inflated ?
                this.options._inflatedIcon :
                this._group.options.iconCreateFunction(this);
            return this._iconObj.createIcon();
        },

        createShadow: function () {
            return null;
        },

        redraw: function () {
            this.setIcon(this); // weird but convenient
        },

        _addObstructiveMarker: function(otherMarker) {
            this._obstructiveMarkers.add(otherMarker);
            otherMarker._obstructiveMarkers.add(this);
        },

        _removeObstructiveMarker: function(otherMarker) {
            this._obstructiveMarkers.delete(otherMarker);
            otherMarker._obstructiveMarkers.delete(this);
        },

        _clearObstructiveMarkers: function() {
            for (const other of this._obstructiveMarkers) {
                this._removeObstructiveMarker(other);
            }
        },

        _getObstructiveMarkers: function() {
            return this._obstructiveMarkers;
        },

        _bringToFront: function(offset=INFLATED_MARKERS_ZINDEX_OFFSET) {
            this.setZIndexOffset(offset);
        },

        _bringBackFromFront: function() {
            this.setZIndexOffset(this._savedZIndexOffset);
        },

        _inflate: function() {
            if (this._inflated)
                return;
            this._bringToFront();
            this._inflated = true;
            this._iconNeedsUpdate = true;
        },

        _deflate: function() {
            if (!this._inflated)
                return;
            if (this._group._inflatedMarkersAbove)
                this._bringBackFromFront();
            else
                this._bringToFront(DEFLATED_MARKERS_ZINDEX_OFFSET);
            this._inflated = false;
            this._iconNeedsUpdate = true;
        },

        toggle: function() {
            if (this._inflated) {
                this._deflate();
            } else {
                this._inflate();
                for (const other of this._obstructiveMarkers) {
                    other._deflate();
                }
            }

            // call daddy to refresh everybody
            this._group._refreshIcons();
        },
    });


    const InflatableMarkerGroup = L.InflatableMarkerGroup = L.FeatureGroup.extend({
        options: {
            obstructionSize: L.point(2, 2),
            iconCreateFunction: null,
            groupPane: L.Marker.prototype.options.pane,
        },

        initialize: function (options) {
            L.Util.setOptions(this, options);
            if (!this.options.obstructionSize instanceof L.Point)
                this.options.obstructionSize = L.point(this.options.obstructionSize);

            this._featureGroup = L.featureGroup();
            this._featureGroup.addEventParent(this);
            this._stations = new Map();
            this._bounds = null;
            this._alreadyDisplayed = false;
            this._inflatedMarkersAbove = true;
        },

        getEvents: function() {
            return {
                'zoomend': this._zoomend,
            };
        },

        _mayObstruct: function(distance, marker1, marker2) {
            const marker1HalfSize  = marker1.getInflatedSize().divideBy(2);
            const marker2HalfSize  = marker2.getInflatedSize().divideBy(2);
            return Math.abs(distance.x) <= marker1HalfSize.x + marker2HalfSize.x + this.options.obstructionSize.x &&
                Math.abs(distance.y) <= marker1HalfSize.y + marker2HalfSize.y + this.options.obstructionSize.y
        },

        addLayer: function (layer) {
            if (this.hasLayer(layer)) {
                return this;
            }

            const marker = new InflatableMarker(layer._latlng, this, layer);
            let inhibited = false;
            if (this._map) {
                const target = this._map.latLngToContainerPoint(layer._latlng);
                for (const [l, m] of this._stations) {
                    const other = this._map.latLngToContainerPoint(l._latlng);
                    if (this._mayObstruct(target.subtract(other), marker, m)) {
                        marker._addObstructiveMarker(m);
                        inhibited = true;
                    }
                }
            }

            this._stations.set(layer, marker);
            this._featureGroup.addLayer(marker);

            if (!inhibited) {
                marker._inflate();
                marker.redraw();
            }

            if (!this._inflatedMarkersAbove && !marker._inflated) {
                marker._bringToFront(DEFLATED_MARKERS_ZINDEX_OFFSET);
            }

            if (this._bounds == null) {
                this._bounds = L.latLngBounds(layer._latlng, layer._latlng);
            } else {
                this._bounds.extend(layer._latlng);
            }
        },

        removeLayer: function (layer) {
            if (this._stations.has(layer)) {
                const marker = this._stations.get(layer);
                marker._clearObstructiveMarkers();
                this._featureGroup.removeLayer(marker);
                this._stations.delete(layer);
            }
        },

        clearLayers: function () {
            this._stations.clear();
            this._featureGroup.clearLayers();
            this._alreadyDisplayed = false; // reset the layer as if it had never
            // been displayed
            this._bounds = null;
        },

        getBounds: function () {
            return this._bounds;
        },

        hasLayer: function(layer) {
            return this._stations.has(layer);
        },

        _recomputeObstructions: function() {
            for (const [l,m] of this._stations) {
                m._clearObstructiveMarkers();
            }

            const iterator = this._stations.entries();
            let result = iterator.next();
            while (!result.done) {
                const marker = result.value[1];
                const target = this._map.latLngToContainerPoint(result.value[0]._latlng);

                // a pity that it's impossible to clone an iterator
                const iterator2 = this._stations.entries();
                let result2 = iterator2.next();
                while (!result2.done && result2.value[1] != marker)
                    result2 = iterator2.next();
                result2 = iterator2.next();
                while (!result2.done) {
                    const other = this._map.latLngToContainerPoint(result2.value[0]._latlng);
                    if (this._mayObstruct(target.subtract(other), marker, result2.value[1])) {
                        marker._addObstructiveMarker(result2.value[1]);
                    }
                    result2 = iterator2.next();
                }
                result = iterator.next();
            }
        },

        onAdd: function (map) {
            this._map = map;
            this._recomputeObstructions();
            this._featureGroup.addTo(map);
            if (!this._alreadyDisplayed) {
                this._alreadyDisplayed = true;
                this.inflateAsManyAsPossible(true);
            }
        },

        onRemove: function (map) {
            this._featureGroup.removeFrom(map);
            this._map = null;
        },

        _refreshIcons: function() {
            for (const [layer, marker] of this._stations) {
                if (marker._iconNeedsUpdate)
                    marker.redraw();
                marker._iconNeedsUpdate = false;
            }
        },

        inflateAsManyAsPossible: function(reset = false) {
            const inhibited = new Set();
            if (!reset) {
                // add all the markers that could obstruct the already inflated
                // markers
                for (const [layer, marker] of this._stations) {
                    if (marker.inflated) {
                        for (const other of marker._obstructiveMarkers) {
                            inhibited.add(other);
                        }
                    }
                }
            }

            for (const [layer, marker] of this._stations) {
                if (!inhibited.has(marker)) {
                    marker._inflate();
                    for (const other of marker._obstructiveMarkers) {
                        inhibited.add(other);
                        other._deflate();
                    }
                }
            }
            this._refreshIcons();
        },

        deflateAll: function() {
            for (const [layer, marker] of this._stations) {
                marker._deflate();
            }
        },

        _zoomend: function() {
            this._recomputeObstructions();
            this.inflateAsManyAsPossible();
        },

        toggleInflatedMarkersAbove() {
            if (this._inflatedMarkersAbove) {
                for (const [layer, marker] of this._stations) {
                    if (!marker._inflated) {
                        marker._bringToFront(DEFLATED_MARKERS_ZINDEX_OFFSET);
                    }
                }
                this._inflatedMarkersAbove = false;
            } else {
                for (const [layer, marker] of this._stations) {
                    if (!marker._inflated) {
                        marker._bringBackFromFront();
                    }
                }
                this._inflatedMarkersAbove = true;
            }
        },

    });

    L.inflatableMarkersGroup = function (options) {
        return new L.InflatableMarkerGroup(options);
    };
}, window));