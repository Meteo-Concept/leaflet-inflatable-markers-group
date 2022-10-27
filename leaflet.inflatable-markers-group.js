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

    /**
     * The Z-index offset to apply to inflated markers to make them show on top
     * of deflated markers
     */
    const INFLATED_MARKERS_ZINDEX_OFFSET = 10000;

    /**
     * The Z-index offset to apply to deflated markers to make them show on top
     * of all markers when the special 'show hidden markers' action is used
     */
    const DEFLATED_MARKERS_ZINDEX_OFFSET = 20000;

    /**
     * A two-state marker that can be added to a InflatableMarkerGroup
     *
     * An inflatable marker can be either inflated (it's displayed normally)
     * or deflated (it's displayed as a smaller different icon to declutter the
     * map).
     *
     * This class is not normally used by end-users. Normal markers should be
     * added to L.InflatableMarkerGroup instead and the group will manage its
     * own L.InflatableMarker-s.
     *
     * To handle the two inflated/deflated states and the associated changes in
     * shape and size, instances of this class are also their own icons.
     * Toggling between the inflated and deflated state boils down to toggle the
     * display of the base marker's icon (shown when inflated) and this class'
     * icon (shown when deflated).
     * @extends L.Marker
     */
    const InflatableMarker = L.InflatableMarker = L.Marker.extend({
        /**
         * The options applicable to the marker, same as the Icon options but
         * an explicit size in mandatory
         * @public
         * @type {L.IconOptions}
         */
        options: L.Icon.prototype.options,

        /**
         * Constructs the marker.
         * @constructs L.InflatableMarker
         * @public
         * @param {L.LatLng} latlng - The position of the marker on the map
         * @param {L.InflatableMarkerGroup} - The group this marker belongs to,
         * marker collisions are only computed inside a single group
         * @param {L.Layer} - The inflated version of the marker, added to the
         * group via addLayer(...)
         */
        initialize: function (latlng, group, baseMarker) {
            L.Util.setOptions(this, baseMarker.options);
            this.options.pane = group.options.pane;
            // hijack the icon drawing process
            this.options._inflatedIcon = this.options.icon;
            this.options.icon = this;

            /**
             * The underlying marker added to the group, used as the inflated
             * version of the current inflatable marker
             * @public
             * @type {L.Marker}
             */
            this.baseMarker = baseMarker;

            /**
             * Where the marker is displayed
             * @private
             * @type {L.LatLng}
             */
            this._latlng = latlng;

            /**
             * The L.InflatableMarkerGroup this marker belongs to
             * @private
             * @type {L.InflatableMarkersGroup}
             */
            this._group = group;

            /**
             * The set of all markers which collision with the current marker if
             * they're both inflated
             * @private
             * @type {Set<L.InflatableMarker>}
             */
            this._obstructiveMarkers = new Set();

            /**
             * Whether the marker is currently inflated
             * @private
             * @type {boolean}
             */
            this._inflated = false;

            /**
             * Whether the marker's icon needs to be redrawn, typically after a
             * change from inflated to deflated or vice-versa
             * @private
             * @type {boolean}
             */
            this._iconNeedsUpdate = true;

            /**
             * The original Z-index attributed to this marker
             * @private
             * @type {integer}
             */
            this._savedZIndexOffset = this.options.zIndexOffset;

            this.addEventParent(this.baseMarker);

            this.on("contextmenu", this.toggle, this);
        },

        /**
         * Gets the size of the marker when inflated.
         * @public
         * @return {L.Point} The inflated size of the marker
         */
        getInflatedSize: function () {
            const iconOptions = this.options._inflatedIcon.options;
            if (!(iconOptions.iconSize instanceof L.Point))
                iconOptions.iconSize = L.point(iconOptions.iconSize);
            return iconOptions.iconSize;
        },

        /**
         * Returns the icon to be displayed on the map, depending on its
         * inflated/deflated state.
         * @public
         * @return {HTMLElement} The icon to draw
         */
        createIcon: function () {
            this._iconObj = this._inflated ?
                this.options._inflatedIcon :
                this._group.options.iconCreateFunction(this);
            return this._iconObj.createIcon();
        },

        /**
         * Returns the shadow to be displayed on the map, alongside with the
         * icon.
         * @public
         * @todo This is not implemented for now and returns null (no shadow)
         * @return {HTMLElement} The shadow to add to the icon
         */
        createShadow: function () {
            return null;
        },

        /**
         * Forces the icon to be redrawn, for example if its inflated/deflated
         * state has been modified externally.
         * @public
         */
        redraw: function () {
            // Wierd but convenient; remember that InflatableMarker-s are their
            // own icons, this is why this works.
            this.setIcon(this);
        },

        /**
         * Sets another marker as conflicting/collisioning with the current one.
         * @private
         * @param {L.InflatableMarker} otherMarker - Another marker in the group
         */
        _addObstructiveMarker: function (otherMarker) {
            this._obstructiveMarkers.add(otherMarker);
            otherMarker._obstructiveMarkers.add(this);
        },

        /**
         * Sets another marker as NOT conflicting/collisioning with the current
         * one (for example, if it's getting removed altogether or reduced in
         * size).
         * @private
         * @param {L.InflatableMarker} otherMarker - Another marker in the group
         */
        _removeObstructiveMarker: function (otherMarker) {
            this._obstructiveMarkers.delete(otherMarker);
            otherMarker._obstructiveMarkers.delete(this);
        },

        /**
         * Removes all markers from the conflicting/collisioning set of the
         * current one.
         * @private
         */
        _clearObstructiveMarkers: function() {
            for (const other of this._obstructiveMarkers) {
                this._removeObstructiveMarker(other);
            }
        },

        /**
         * Returns the set of all markers conflicting/collisioning to the
         * current one.
         * @private
         * @return {Set<L.InflatableMarker>} The conflicting/collisioning
         * markers.
         */
        _getObstructiveMarkers: function() {
            return this._obstructiveMarkers;
        },

        /**
         * Puts a marker on top, this is used to ensure for instance that
         * inflated markers are shown on top by default
         * @private
         * @param {int} offset - The offset by which to increase the Z-index of
         * the marker
         */
        _bringToFront: function(offset=INFLATED_MARKERS_ZINDEX_OFFSET) {
            this.setZIndexOffset(offset);
        },

        /**
         * Puts a marker back where it was after it has been brought onto top.
         * @private
         */
        _bringBackFromFront: function() {
            this.setZIndexOffset(this._savedZIndexOffset);
        },

        /**
         * Switches the marker to the inflated state (or no-op if it was already
         * inflated).
         * @private
         */
        _inflate: function() {
            if (this._inflated)
                return;
            this._bringToFront();
            this._inflated = true;
            this._iconNeedsUpdate = true;
        },

        /**
         * Switches the marker to the deflated state (or no-op if it was already
         * inflated).
         * @private
         */
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

        /**
         * Toggles the inflated/deflated state of the marker
         * @public
         */
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

        /**
         * Tells whether the marker is currently inflated
         * @public
         * @return {boolean} Whether the marker is inflated
         */
        isInflated: function() {
            return this._inflated;
        },
    });

    /**
     * A group of inflatable markers that can be added onto a leaflet map.
     *
     * This class should be used as a regular L.FeatureGroup but for now, users
     * should stick to L.Marker objects. Other features are not explicitly
     * supported (but have never been tested so who knows?). In any case, this
     * class handled its own L.InflatableMarker, so end-users should not
     * construct them manually but instead add the normal markers to this group.
     *
     * The markers group make sure that two conflicting markers (i.e. markers
     * that would collision if they are both inflated) are never inflated at the
     * same time. This makes the map much more readable while keeping the
     * markers at their place on the map, as long as the deflated icon of each
     * marker is carefully chosen not to clutter the map.
     * @extends L.FeatureGroup
     */
    const InflatableMarkersGroup = L.InflatableMarkersGroup = L.FeatureGroup.extend({
        /**
         * How to configure the markers group, additionally from the
         * L.FeatureGroup options
         * @public
         */
        options: {
            /**
             * The margin that must be kept clear around an inflated marker.
             *
             * Any marker closer to the current marker than this clearance will
             * be marked as collisioning. The first element is the horizontal
             * margin, the second one the vertical margin. It's set by default
             * to [2, 2] (pixels). You can set it to [0, 0] or even to a
             * negative value to tolerate some amount of overlapping between
             * inflated markers.
             */
            obstructionSize: L.point(2, 2),
            /**
             * The function that will be used to create deflated markers' icons.
             */
            iconCreateFunction: null,
            /**
             * The map pane this group has to be added to, by default the
             * markers pane
             */
            groupPane: L.Marker.prototype.options.pane,
        },

        /**
         * Constructs an InflatableMarkersGroup
         * @constructs {L.InflatableMarkersGroup}
         * @param {L.InflatableMarkersGroup.options} options - The configuration options
         */
        initialize: function (options) {
            L.Util.setOptions(this, options);
            if (!this.options.obstructionSize instanceof L.Point)
                this.options.obstructionSize = L.point(this.options.obstructionSize);

            /**
             * The underlying layer group used to handle the map layer adding and
             * removal operations
             * @private
             * @type {L.FeatureGroup}
             */
            this._featureGroup = L.featureGroup();

            /**
             * A associative array between base Leaflet layers (the one added to
             * this group) and the corresponding inflatable markers this group
             * constructs.
             *
             * Note: this attribute is a Map but a Javascript one (i.e. an
             * associative array), not a Leaflet Map!
             * @private
             * @type {Map<L.Layer, L.InflatableMarker>}
             */
            this._markers = new Map();

            /**
             * The boundaries of this layer group
             * @private
             * @type {L.LatLngBounds}
             */
            this._bounds = null;

            /**
             * Whether this group has already been initialized and added to a map,
             * setting it to false will force recompute all the InflatableMarker-s
             * collisions.
             * @private
             * @type {boolean}
             */
            this._alreadyDisplayed = false;

            /**
             * Whether the inflated markers should be displayed on top of deflated
             * markers (the default) or the opposite (to make masked deflated
             * markers prominent).
             * @type {boolean}
             */
            this._inflatedMarkersAbove = true;

            /**
             * Other InflatableMarkersGroup that could be added to the same map and
             * whose member markers may collision with the current group.
             * @type {Set<L.InflatableMarkersGroup>}
             */
            this._otherGroups = new Set();

            this._featureGroup.addEventParent(this);
        },

        /**
         * The events we handle.
         *
         * The class reacts to zooming/dezooming to inflate as many markers as
         * possible with the new zoom without causing collisions.
         * @public
         * @inheritdoc
         */
        getEvents: function() {
            return {
                'zoomend': this._zoomend,
            };
        },

        /**
         * Whether two markers collision when both are inflated
         *
         * @param {L.Point} distance - The distance between the center of both
         * markers
         * @param {L.InflatableMarker} marker1 - The first marker
         * @param {L.InflatableMarker} marker2 - The second marker
         * @return {boolean} Whether the markers are closer to each other than
         * the obstruction size
         */
        _mayObstruct: function(distance, marker1, marker2) {
            const marker1HalfSize  = marker1.getInflatedSize().divideBy(2);
            const marker2HalfSize  = marker2.getInflatedSize().divideBy(2);
            return Math.abs(distance.x) <= marker1HalfSize.x + marker2HalfSize.x + this.options.obstructionSize.x &&
                Math.abs(distance.y) <= marker1HalfSize.y + marker2HalfSize.y + this.options.obstructionSize.y
        },

        /**
         * Add a marker to the group and compute the collisions with already
         * existing markers
         * @param {L.Marker} layer - A marker to add (technically, it should be
         * any layer, but we kind of break the Liskov principle to make things
         * simpler for now...)
         * @public
         * @inheritdoc
         */
        addLayer: function (layer) {
            if (this.hasLayer(layer)) {
                return this;
            }

            const marker = new InflatableMarker(layer._latlng, this, layer);
            let inhibited = false;
            if (this._map) {
                const target = this._map.latLngToContainerPoint(layer._latlng);
                for (const [l, m] of this._markers) {
                    const other = this._map.latLngToContainerPoint(l._latlng);
                    if (this._mayObstruct(target.subtract(other), marker, m)) {
                        marker._addObstructiveMarker(m);
                        inhibited = true;
                    }
                }
            }

            this._markers.set(layer, marker);
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

        /**
         * Remove a marker from the group and recompute the collisions of
         * previously collisioning markers
         * @param {L.Layer} layer - The layer to remove
         * @public
         * @inheritdoc
         */
        removeLayer: function (layer) {
            if (this._markers.has(layer)) {
                const marker = this._markers.get(layer);
                marker._clearObstructiveMarkers();
                this._featureGroup.removeLayer(marker);
                this._markers.delete(layer);
            }
        },

        /**
         * Remove all layers from this group and reset it completely
         * @public
         * @inheritdoc
         */
        clearLayers: function () {
            this._markers.clear();
            this._featureGroup.clearLayers();
            this._alreadyDisplayed = false; // reset the layer as if it had never
            // been displayed
            this._bounds = null;
        },

        /**
         * Returns the bounds of this group on the map
         * @return L.LatLngBounds
         * @public
         * @inheritdoc
         */
        getBounds: function () {
            return this._bounds;
        },

        /**
         * Whether a marker has been added to the group
         * @param {L.Marker} layer - The marker looked for
         * @return {boolean} whether the layer belongs to this group
         * @public
         * @inheritdoc
         */
        hasLayer: function(layer) {
            return this._markers.has(layer);
        },

        /**
         * Recompute all collision sets for all markers
         * @private
         */
        _recomputeObstructions: function() {
            for (const [l,m] of this._markers) {
                m._clearObstructiveMarkers();
            }

            const iterator = this._markers.entries();
            let result = iterator.next();
            while (!result.done) {
                const marker = result.value[1];
                const target = this._map.latLngToContainerPoint(result.value[0]._latlng);

                const iterator2 = this._iterateOnOwnAndOtherGroupsMarkers();
                let result2 = iterator2.next();
                while (!result2.done) {
                    if (result2.value[1] != marker) {
                        const other = this._map.latLngToContainerPoint(result2.value[0]._latlng);
                        if (this._mayObstruct(target.subtract(other), marker, result2.value[1])) {
                            marker._addObstructiveMarker(result2.value[1]);
                        }
                    }
                    result2 = iterator2.next();
                }
                result = iterator.next();
            }
        },

        _iterateOnOwnAndOtherGroupsMarkers() {
            const AllMarkersIterator = L.Class.extend({
                initialize: function (group) {
                    this.group = group;
                    this.done = false;
                    this.iteratorOnGroups = group._otherGroups.values();
                    this.iteratorOnMarkers = group._markers.entries();
                },

                next: function () {
                    let result = this.iteratorOnMarkers.next();
                    while (result.done) {
                        let gr = this.iteratorOnGroups.next();
                        if (gr.done) {
                            return { done: true };
                        } else {
                            this.iteratorOnMarkers = gr.value._markers.entries();
                            result = this.iteratorOnMarkers.next();
                        }
                    }
                    return result;
                },
            });

            return new AllMarkersIterator(this);
        },

        /**
         * React to this group being added onto a map
         *
         * Computation of the collision sets is delayed until this method is
         * called.
         * @param {L.Map} map - The leaflet map
         * @public
         * @inheritdoc
         */
        onAdd: function (map) {
            this._map = map;
            this._recomputeObstructions();
            this._featureGroup.addTo(map);
            if (!this._alreadyDisplayed) {
                this._alreadyDisplayed = true;
                this.inflateAsManyAsPossible(true);
            }
        },

        /**
         * React to this group being removed from a map
         *
         * The collision sets are not cleared at this point in case someone
         * wants to have a look at them but they will be recomputed if the
         * group is added again onto a map anyway.
         * @param {L.Map} map - The leaflet map
         * @public
         * @inheritdoc
         */
        onRemove: function (map) {
            this._featureGroup.removeFrom(map);
            this._map = null;
        },

        /**
         * Redraw all icons that are marked for update (after zooming in for
         * instance)
         * @private
         * @inheritdoc
         */
        _refreshIcons: function() {
            const iterator = this._iterateOnOwnAndOtherGroupsMarkers();
            let result = iterator.next();
            while (!result.done) {
                const marker = result.value[1];
                if (marker._iconNeedsUpdate)
                    marker.redraw();
                marker._iconNeedsUpdate = false;
                result = iterator.next();
            }
        },

        /**
         * Inflate as many deflated markers as possible without causing
         * collisions
         *
         * We don't actually go clever and guarantee that we display the
         * theoretical maximum number of markers. We just go through them in
         * order and avoid inflating a marker if it would collision with already
         * inflated markers.
         *
         * @param {boolean} reset - Start by deflating all markers before
         * inflating as many as possible
         * @public
         */
        inflateAsManyAsPossible: function(reset = false) {
            const inhibited = new Set();
            if (!reset) {
                // add all the markers that could obstruct the already inflated
                // markers
                for (const [layer, marker] of this._markers) {
                    if (marker.inflated) {
                        for (const other of marker._obstructiveMarkers) {
                            inhibited.add(other);
                        }
                    }
                }
            }

            for (const [layer, marker] of this._markers) {
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

        /**
         * Deflate all markers
         * @public
         */
        deflateAll: function() {
            for (const [layer, marker] of this._markers) {
                marker._deflate();
            }
        },

        /**
         * React to zoom/dezoom by recomputing the collision between markers and
         * inflate as many as possible
         * @private
         */
        _zoomend: function() {
            this._recomputeObstructions();
            this.inflateAsManyAsPossible();
        },

        /**
         * Toggles between showing the inflating markers on top of all markers
         * (the normal state) and showing the deflating markers (so that we can
         * locate deflated markers previously hidden).
         * @public
         */
        toggleInflatedMarkersAbove() {
            if (this._inflatedMarkersAbove) {
                for (const [layer, marker] of this._markers) {
                    if (!marker._inflated) {
                        marker._bringToFront(DEFLATED_MARKERS_ZINDEX_OFFSET);
                    }
                }
                this._inflatedMarkersAbove = false;
            } else {
                for (const [layer, marker] of this._markers) {
                    if (!marker._inflated) {
                        marker._bringBackFromFront();
                    }
                }
                this._inflatedMarkersAbove = true;
            }
        },

        makeAwareOfOtherGroup(other) {
            this._otherGroups.add(other);
            other._otherGroups.add(this);
            if (this._map) {
                this._recomputeObstructions();
                this.inflateAsManyAsPossible();
            }
        },

        removeOtherGroup(other) {
            this._otherGroups.delete(other);
            other._otherGroups.delete(this);
            if (this._map) {
                this._recomputeObstructions();
                this.inflateAsManyAsPossible();
            }
        },
    });

    /**
     * Constructs an inflatable markers group
     * @constructs {L.InflatableMarkersGroup}
     * @param {L.InflatableMarkersGroup.options} options - the configuration
     * @return {L.InflatableMarkersGroup} The newly constructed group
     */
    L.inflatableMarkersGroup = function (options) {
        return new L.InflatableMarkersGroup(options);
    };
}, window));
