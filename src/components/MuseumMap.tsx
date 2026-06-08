import { useMemo, useRef } from 'react'
import { Map as MapLibre, Marker, Popup } from 'react-map-gl/maplibre'
import type { MapRef } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { hasCoords } from '@/lib/museums'
import type { Museum } from '@/lib/museums'

type Props = {
  museums: Array<Museum>
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const STYLE_URL = '/api/map/style.json'

export default function MuseumMap({ museums, selectedId, onSelect }: Props) {
  const mapRef = useRef<MapRef | null>(null)
  const mappable = useMemo(() => museums.filter(hasCoords), [museums])
  const selected = useMemo(
    () => mappable.find((m) => m.id === selectedId) ?? null,
    [mappable, selectedId],
  )

  return (
    <div className="relative h-full w-full border-3 border-foreground bg-background">
      <MapLibre
        ref={mapRef}
        initialViewState={{
          longitude: -0.1276,
          latitude: 51.5072,
          zoom: 11,
        }}
        mapStyle={STYLE_URL}
        style={{ width: '100%', height: '100%' }}
        attributionControl={{ compact: true }}
      >
        {mappable.map((m) => (
          <Marker
            key={m.id}
            longitude={m.longitude}
            latitude={m.latitude}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              onSelect(m.id)
              mapRef.current?.flyTo({
                center: [m.longitude, m.latitude],
                zoom: Math.max(mapRef.current.getZoom(), 13),
                duration: 600,
              })
            }}
          >
            <button
              type="button"
              aria-label={m.name}
              className={`block h-4 w-4 cursor-pointer border-2 border-foreground transition-transform hover:scale-125 ${
                selectedId === m.id ? 'scale-150 bg-accent' : m.price === 0 ? 'bg-primary' : 'bg-secondary'
              }`}
              style={{ boxShadow: '2px 2px 0 hsl(var(--shadow-color))' }}
            />
          </Marker>
        ))}

        {selected ? (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            anchor="bottom"
            offset={18}
            closeButton={false}
            closeOnClick={false}
            onClose={() => onSelect(null)}
            className="brutal-popup"
          >
            <div className="min-w-[200px] p-1">
              <p className="m-0 text-sm font-black uppercase tracking-tight text-foreground">
                {selected.name}
              </p>
              <p className="m-0 mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {[selected.borough, selected.priceText].filter(Boolean).join(' · ')}
              </p>
            </div>
          </Popup>
        ) : null}
      </MapLibre>
    </div>
  )
}
