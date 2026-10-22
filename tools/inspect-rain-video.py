import bpy
from pathlib import Path
root=Path(__file__).resolve().parent.parent
scene=bpy.context.scene
scene.sequence_editor_create().sequences.new_movie('Rain source',str(root/'images/weather/rain-glass-source.mp4'),channel=1,frame_start=1)
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'.local/rain-source-frame.png')
scene.frame_set(90);scene.view_settings.view_transform='Standard'
bpy.ops.render.render(write_still=True)
