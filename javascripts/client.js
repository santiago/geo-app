var Geo= {};
function locationToPoint(location) {
    var point= new OpenLayers.Geometry.Point(location[1],location[0]);
    point.transform(
        new OpenLayers.Projection("EPSG:4326"),
        new OpenLayers.Projection("EPSG:900913")
    );
    return point;
}

Geo.createFeatureFromLocation= function(location, radius) {
    var point= locationToPoint(location);

    var geometry= OpenLayers.Geometry.Polygon.createRegularPolygon(point, radius, 40, 0);
    var feature= new OpenLayers.Feature.Vector(geometry);
    return feature;
};

var App;

function Service(opts) {
    var self= this;
    
    var url= function() {
        if(location.hostname.match("senchafy")) {
            return location.hostname;
        } else {
            return "http://"+location.hostname+":8080";
        }
    }();
    
    Ext.io.setup({
        logLevel:'debug',
        appId:opts.userId,
        appKey:opts.userId,
        deviceId:opts.userId,
        deviceKey:opts.userId,
        deviceSid:opts.userId,
        url:url,
        key:opts.userId,
        transportName:'socket'
    });

        //console.log("Waiting for GeoService ...");
    Ext.io.getService({
        name: "geo",
        success: function(service) {
            //console.log("Got GeoService!");
            self.geo= service;
            $(document).trigger('geo', self);
            service.subscribe({
                success: function(from, data) { $(document).trigger('geo:data', [from, data]) },
                failure: function(error, options) {
                    console.log(error);
                }
            });
        }
    });
    
     Ext.io.getService({
        name: "geofencing",
        success: function(service) {
            self.geofencing= service;
            $(document).trigger('geofencing', service);
            service.subscribe({ 
                success: function(from, data) { $(document).trigger('geo:data', [from, data]) },
                failure: function(error, options) {
                    console.log(error);
                }
            });
        }
    });
}

function init(opts) {
    var self= this;
    this.userId= opts.userId;
    this.service= opts.service;

    var lastMouseDown= [];
    var polygonControl={};
    var selectFeatureControl={};
    var removeFeatures= [];
    
    // Setup Polygon Layer
    var polygonLayer = new OpenLayers.Layer.Vector("Polygon Layer");
    $(document).on('geofencing', function(e, service) {
        self.service.geofencing.send({ message: {event:"get_covers"} });
    });
    try {
        self.service.geofencing.send({ message: {event:"get_covers"} });
    } catch(e) {
        console.log(e);
    }
    
    this.deleteFeatures= function() {
        if(!removeFeatures.length) { return false }
        polygonLayer.destroyFeatures(removeFeatures);
        removeFeatures= [];
    };
    this.isDrawing= function() {
        return polygonControl.active;
    };
    this.isRemoving= function() {
        return selectFeatureControl.active;
    };
    this.toggleDraw= function() {
        if(this.isDrawing()) {
            polygonControl.deactivate();
            $("#actions .action.draw").removeClass('on');
            $.jGrowl("Drawing stopped");
        } else {
            polygonControl.activate();
            $("#actions .action.draw").addClass('on');
            $.jGrowl("Drawing started.\nPlease drag on the map to draw a Cover Area.");
        }
    };
    this.toggleRemove= function() {
        if(this.isRemoving()) {
            selectFeatureControl.deactivate();
            $("#actions .action.remove").removeClass('on');
            $.jGrowl("Removing stopped");
        } else {
            selectFeatureControl.activate();
            $("#actions .action.remove").addClass('on');
            $.jGrowl("Removing started.\nClick on the Cover Area you want to remove, then press Esc.");
        }
    };

    $(document).on('geo:data', function(e, from, data) {
        switch(data.event) {
            case "enter_area":
                if(data.covers.length) {
                    var noti= "You're within these regions: \n"+data.covers.join(', ');
                    $.jGrowl(noti);
                }                
                break;
            case "new_cover":
                break;
            case "covers":
                data.covers.forEach(function(cover) {
                    var feature= Geo.createFeatureFromLocation(cover.center, cover.radius);
                    polygonLayer.addFeatures(feature);
                });
                break;
            default:
                break;
        }
    });

    // Render Geo UI
    startUi.call(this);

    // The marker icon
    var size = new OpenLayers.Size(21,25);
    var offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
    var icon = new OpenLayers.Icon('/images/marker.png', size, offset);

    this.map = new OpenLayers.Map('map');
    var map= this.map;
    map.addControl(new OpenLayers.Control.LayerSwitcher());

    var markers = new OpenLayers.Layer.Markers("Markers");
    map.addLayer(markers);

    $("#map").on('mousedown', function(e) {
        var point= map.getLonLatFromViewPortPx({x:e.offsetX,y:e.offsetY});
        point.transform(
            map.getProjectionObject(),
            new OpenLayers.Projection("EPSG:4326"));
        lastMouseDown= [point.lat,point.lon];
    });
    
    map.events.register('click', this, function(e) {
        var point= map.getLonLatFromViewPortPx(e.xy);
        //markers.addMarker(new OpenLayers.Marker(point,icon));
    });

    var gphy = new OpenLayers.Layer.Google(
        "Google Physical",
        {type: google.maps.MapTypeId.TERRAIN}
    );
    
    var gmap = new OpenLayers.Layer.Google(
        "Google Streets", // the default
        {numZoomLevels: 20}
    );
    var ghyb = new OpenLayers.Layer.Google(
        "Google Hybrid",
        {type: google.maps.MapTypeId.HYBRID, numZoomLevels: 20}
    );
    var gsat = new OpenLayers.Layer.Google(
        "Google Satellite",
        {type: google.maps.MapTypeId.SATELLITE, numZoomLevels: 22}
    );
    
    map.addLayers([gmap, gphy, ghyb, gsat]);

    // Google.v3 uses EPSG:900913 as projection, so we have to
    // transform our coordinates
    map.setCenter(new OpenLayers.LonLat(10.2, 48.9).transform(
        new OpenLayers.Projection("EPSG:4326"),
        map.getProjectionObject()
    ), 5);

    map.addLayers([polygonLayer]);
    map.addControl(new OpenLayers.Control.MousePosition());

    selectFeatureControl= new OpenLayers.Control.SelectFeature(polygonLayer, {
        onSelect: function(e,f) {
            removeFeatures=[e];
        }
    });
    map.addControl(selectFeatureControl);
    var polyOptions = {sides: 40};
    polygonControl = new OpenLayers.Control.DrawFeature(
                        polygonLayer,
                        OpenLayers.Handler.RegularPolygon, 
                        {   handlerOptions: polyOptions,
                            featureAdded: function(feature) {
                                var radius= Math.sqrt(feature.geometry.getArea()/Math.PI);
                                var center= lastMouseDown;
                                self.service.geofencing.send({
                                    message: {event:"add_cover", cover: {center:center, radius:radius}}
                                });
                            }
                        });

    var dragPolygons= new OpenLayers.Control.DragFeature(polygonLayer);
    map.addControl(polygonControl);
    map.addControl(dragPolygons);

    $(window).keyup(function(e) {
        // If D for Draw
        if(e.keyCode==68) {
            self.toggleDraw();
        };
        // If E for Edit
        /*if(e.keyCode==69) {
            dragPolygons.activate();
        };*/
        // If X for Select to delete
        if(e.keyCode==88) {
            self.toggleRemove();
        };
        if(e.keyCode==27) {
            self.deleteFeatures();
        };
        // Space Bar
        if(e.keyCode==32) {
            $.jGrowl("Drawing deactivated");
            dragPolygons.deactivate();
            polygonControl.deactivate();
        };
    });

    function success(pos) {
        self.position= [pos.coords.latitude,pos.coords.longitude];
        var point= new OpenLayers.LonLat(self.position[1],self.position[0])
            .transform(new OpenLayers.Projection("EPSG:4326"),map.getProjectionObject());
        map.setCenter(point, 16);
        markers.addMarker(new OpenLayers.Marker(point,icon));
        self.popup();
        self.sendPosition();
    }

    function error(error) {
        console.log(error);
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        alert('not supported');
        return;
    }
}

// init public methods
init.prototype.sendPosition= function() {
    this.service.geo.send({ message: { 'position': this.position } });
};

init.prototype.popup= function() {
    var popup= new OpenLayers.Popup("chicken", // Label
                    new OpenLayers.LonLat(this.position[1],this.position[0]), // Point
                    new OpenLayers.Size(200,200), // Size
                    "example popup", // Text
                    true); // ?
    this.map.addPopup(popup);
};


// init private methods
function startUi() {
    var self= this;
    
    $(".start").hide();
    $("#main").show();
    $("header .user").text(this.userId);
    
    $("#actions .action").click(function(e) {
        e.preventDefault();
        $(this).blur();
        if($(this).hasClass('draw')) { self.toggleDraw() }
        if($(this).hasClass('remove')) { self.toggleRemove() }
    });
}

// Start the App
jQuery(document).ready(function($) {
    var userId= sessionStorage.getItem("userId");
    if(!userId) {
        $(".start").show();
        $("#loadUser input").focus();

        function go() {
            var user= $.trim($("#loadUser input").val());
            if(user) {
                userId= user;
                sessionStorage.setItem("userId", userId);
                $("#loadUser .ajaxloader").show();
                $("#loadUser input").prop('disabled', true);
                $("#loadUser input").blur();
                new Service({userId:userId});
            } else {
                $("#loadUser input").focus();
            }
        }

        // Go! on enter
        $("#loadUser input").keyup(function(e) {
            if(e.keyCode==13) {
                go();
            };
        });
        // Go! on click
        $("#loadUser button").on('click', function(e) {
            go();
        });
    } else {
        new Service({userId:userId});
    }

    $(document).on('geo', function(e, service) {
        App= new init({service:service, userId:userId});
    });
});