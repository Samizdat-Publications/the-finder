"""Renders four views of public/media/models/voyager.glb into build/models/.
Run: blender -b --factory-startup -P tools/models/render-voyager.py -- <glb> <outdir>
Views: front (looking down -Z toward the dish... see CAMS), three-quarter, record face close up,
dish from behind. glTF is Y up; Blender imports it Z up (x, -z, y), so cameras are given in glTF
coordinates and converted here.
"""
import sys, math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, outdir = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

def g2b(v):  # glTF (x, y, z) -> Blender (x, -z, y)
    return Vector((v[0], -v[2], v[1]))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1000
scene.render.resolution_y = 800
scene.render.image_settings.file_format = 'PNG'
w = bpy.data.worlds.new('w'); w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.02, 0.04, 1)
w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
scene.world = w

def add_sun(direction_g, energy):
    d = bpy.data.lights.new('sun', 'SUN'); d.energy = energy
    o = bpy.data.objects.new('sun', d); scene.collection.objects.link(o)
    o.rotation_euler = (-g2b(direction_g)).to_track_quat('-Z', 'Y').to_euler()

add_sun((-0.4, -0.7, -0.6), 4.0)
add_sun((0.6, -0.3, 0.8), 2.0)

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
scene.camera = cam

def shoot(name, eye_g, target_g, lens=35, ortho=None):
    cam_data.lens = lens
    cam.location = g2b(eye_g)
    d = g2b(target_g) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam_data.clip_start = 0.01; cam_data.clip_end = 200
    scene.render.filepath = f'{outdir}/voyager_{name}.png'
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)

# Craft centre ~ (0, 1.5, 4). The dish axis is +Y up in glTF? Extents: Y -2..9, Z -4.2..12.7 (boom).
shoot('front', (0.0, 3.0, -22.0), (0.0, 2.5, 4.0), lens=40)
shoot('threequarter', (16.0, 11.0, -14.0), (0.0, 2.0, 3.5), lens=40)
shoot('record', (4.5, 0.0, -0.002), (0.948, 0.0, -0.002), lens=50)
shoot('dish_behind', (-3.0, -14.0, 3.0), (0.0, 1.0, 2.0), lens=40)
