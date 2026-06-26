"use client";

import { Delaunay } from "d3-delaunay";
import L from "leaflet";
import "leaflet.heat";
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import { gapColor } from "@/lib/color";
import type { DistrictSummary, HeatPoint } from "@/lib/types";

export type LayerMode = "choropleth" | "heatmap" | "both";

interface Props {
  districts: DistrictSummary[];
  scoresById: Record<string, number>;
  hypotheticalIds: Set<string>;
  heatPoints: HeatPoint[];
  layer: LayerMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const AD_CENTER: [number, number] = [24.45, 54.5];

function HeatLayer({
  points,
  visible,
}: {
  points: HeatPoint[];
  visible: boolean;
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!visible || points.length === 0) return;

    const data = points.map(
      (p) => [p.lat, p.lon, p.weight] as [number, number, number]
    );
    // @ts-expect-error leaflet.heat augments L at runtime
    const heat = L.heatLayer(data, {
      radius: 24,
      blur: 22,
      maxZoom: 14,
      max: 0.6,
      minOpacity: 0.25,
      gradient: {
        0.0: "#1d4ed8",
        0.3: "#06b6d4",
        0.5: "#eab308",
        0.7: "#f97316",
        1.0: "#ef4444",
      },
    });
    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, visible]);

  return null;
}

export default function MapView({
  districts,
  scoresById,
  hypotheticalIds,
  heatPoints,
  layer,
  selectedId,
  onSelect,
}: Props) {
  // Build Voronoi cells from district centroids, clipped to a padded bbox.
  const cells = useMemo(() => {
    if (districts.length === 0) return [];
    const pts: [number, number][] = districts.map((d) => [d.lon, d.lat]);
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const pad = 0.06;
    const bbox: [number, number, number, number] = [
      Math.min(...lons) - pad,
      Math.min(...lats) - pad,
      Math.max(...lons) + pad,
      Math.max(...lats) + pad,
    ];
    const delaunay = Delaunay.from(pts);
    const voronoi = delaunay.voronoi(bbox);
    return districts.map((d, i) => {
      const poly = voronoi.cellPolygon(i);
      const latlngs: [number, number][] = poly
        ? poly.map(([lon, lat]) => [lat, lon] as [number, number])
        : [];
      return { district: d, latlngs };
    });
  }, [districts]);

  const showChoropleth = layer === "choropleth" || layer === "both";
  const showHeat = layer === "heatmap" || layer === "both";

  return (
    <MapContainer
      center={AD_CENTER}
      zoom={11}
      minZoom={9}
      maxZoom={16}
      zoomControl
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      {showChoropleth &&
        cells.map(({ district, latlngs }) => {
          if (latlngs.length === 0) return null;
          const score = scoresById[district.district_id] ?? district.gap_score;
          const isSelected = district.district_id === selectedId;
          const isHypo = hypotheticalIds.has(district.district_id);
          return (
            <Polygon
              key={district.district_id}
              positions={latlngs}
              pathOptions={{
                color: isSelected ? "#ffffff" : "#0b1322",
                weight: isSelected ? 2.5 : 1,
                opacity: showHeat ? 0.5 : 0.9,
                fillColor: gapColor(score),
                fillOpacity: showHeat ? 0.28 : 0.6,
                dashArray: isHypo ? "6 5" : undefined,
              }}
              eventHandlers={{ click: () => onSelect(district.district_id) }}
            >
              <Tooltip sticky opacity={1} className="eq-tooltip">
                <div style={{ fontWeight: 600 }}>{district.name}</div>
                <div>
                  Gap {score.toFixed(1)}
                  {isHypo ? " (what-if)" : ""}
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

      <HeatLayer points={heatPoints} visible={showHeat} />
    </MapContainer>
  );
}
