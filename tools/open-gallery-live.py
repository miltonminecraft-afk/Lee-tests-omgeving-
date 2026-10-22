import bpy
bpy.context.scene.cycles.preview_samples=32
bpy.context.scene.cycles.use_preview_denoising=True
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.region_3d.view_camera_zoom=8
            area.spaces.active.shading.type='RENDERED'
            area.spaces.active.overlay.show_overlays=False
bpy.ops.object.select_all(action='DESELECT')
