import runpy,struct,unittest,uuid
from pathlib import Path
api=runpy.run_path(str(Path(__file__).with_name('splat-checkpoint.py')))

def ply(value):
 return b'ply\nformat binary_little_endian 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n'+struct.pack('<fff',value,0,0)

class CheckpointTest(unittest.TestCase):
 def test_resume_uses_latest_complete_checkpoint_and_preserves_original_seed(self):
  root=Path(__file__).resolve().parent.parent/'.local'/('checkpoint-test-'+uuid.uuid4().hex)
  root.mkdir(parents=True)
  if root.is_dir():
   data=root/'data';out=root/'out';data.mkdir();out.mkdir()
   (data/'init.ply').write_bytes(ply(1))
   (out/'export_2000.ply').write_bytes(ply(2))
   (out/'export_4000.ply').write_bytes(ply(4)[:-3])
   self.assertTrue(api['complete_ply'](out/'export_2000.ply'))
   self.assertFalse(api['complete_ply'](out/'export_4000.ply'))
   self.assertEqual(api['resume_args'](data,out,8000),['--start-iter',2000])
   self.assertEqual((data/'init.ply').read_bytes(),ply(2))
   (out/'export_4000.ply').write_bytes(ply(4))
   self.assertEqual(api['resume_args'](data,out,8000),['--start-iter',4000])
   self.assertEqual((data/'seed-before-resume.ply').read_bytes(),ply(1))
   self.assertEqual((data/'init.ply').read_bytes(),ply(4))

if __name__=='__main__':unittest.main()
