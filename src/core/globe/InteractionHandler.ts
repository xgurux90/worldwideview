import {
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    defined,
    SceneMode,
} from "cesium";
import type { Viewer as CesiumViewer, Cartesian2 } from "cesium";
import type { GeoEntity } from "@/core/plugins/PluginTypes";
import { useStore } from "@/core/state/store";

/**
 * Pick a WorldWideView entity at a screen position using the Cesium scene.pick API.
 */
function findEntityAtPosition(viewer: CesiumViewer, position: { x: number; y: number }): GeoEntity | null {
    const picked = viewer.scene.pick(position as Cartesian2);
    if (defined(picked) && picked.id && picked.id._wwvEntity) {
        return picked.id._wwvEntity as GeoEntity;
    }
    return null;
}

/**
 * Sets up click and hover handlers on the viewer canvas.
 * Returns a cleanup function that destroys the handler and resets the cursor.
 */
export function setupInteractionHandlers(
    viewer: CesiumViewer,
    hoveredEntityIdRef: React.MutableRefObject<string | null>
): () => void {
    const canvas = viewer.scene.canvas;

    const handler = new ScreenSpaceEventHandler(canvas);

    // Click → select entity
    handler.setInputAction(
        (event: { position: { x: number; y: number } }) => {
            const entity = findEntityAtPosition(viewer, event.position);
            useStore.getState().setSelectedEntity(entity);
            if (entity) {
                useStore.getState().setHoveredEntity(null, null);
                hoveredEntityIdRef.current = null;
            }
        },
        ScreenSpaceEventType.LEFT_CLICK
    );

    // Hover → show tooltip card
    let hoverTimeout: NodeJS.Timeout | null = null;
    const HOVER_THROTTLE_MS = 100; // 10 Hz

    handler.setInputAction(
        (event: { endPosition: { x: number; y: number } }) => {
            // Instantly update screen position to keep tooltip following mouse smoothly if already hovered
            if (hoveredEntityIdRef.current) {
                useStore.setState({
                    hoveredScreenPosition: { x: event.endPosition.x, y: event.endPosition.y },
                });
            }

            // Wait for both throttle and camera/scene to be stable
            if (hoverTimeout !== null) return;

            const pos = { x: event.endPosition.x, y: event.endPosition.y };

            hoverTimeout = setTimeout(() => {
                hoverTimeout = null;
                // Picking is unreliable while the scene is morphing between modes
                if (viewer.scene.mode === SceneMode.MORPHING) return;

                const entity = findEntityAtPosition(viewer, pos);
                const prevId = hoveredEntityIdRef.current;
                const newId = entity ? entity.id : null;

                if (prevId !== newId) {
                    hoveredEntityIdRef.current = newId;
                    canvas.style.cursor = entity ? "pointer" : "default";
                    useStore.getState().setHoveredEntity(
                        entity,
                        entity ? pos : null
                    );
                }
            }, HOVER_THROTTLE_MS);
        },
        ScreenSpaceEventType.MOUSE_MOVE
    );

    return () => {
        if (hoverTimeout !== null) clearTimeout(hoverTimeout);
        handler.destroy();
        canvas.style.cursor = "default";
    };
}
