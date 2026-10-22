"""Prove that a compression reorder preserves every decoded splat record.

Compare decoded PLY files, including appearance, orientation and opacity.
Point order may differ, but no field or point may change or disappear.
"""
import argparse, hashlib, json, runpy
from pathlib import Path
import numpy as np

load = runpy.run_path(str(Path(__file__).with_name('check-splat-geometry.py')))['load']

def compare(source, result):
    a, b = load(source), load(result)
    report = dict(source=str(source), result=str(result), sourcePoints=len(a),
                  resultPoints=len(b), sameFields=a.dtype == b.dtype)
    if a.dtype != b.dtype or len(a) != len(b):
        return dict(report, allDecodedRecordsIdentical=False)
    records = lambda value: np.sort(np.asarray(value).view(
        np.dtype((np.void, value.dtype.itemsize))).reshape(-1))
    aa, bb = records(a), records(b)
    return dict(report, allDecodedRecordsIdentical=bool(np.array_equal(aa, bb)),
                sha256=hashlib.sha256(aa.tobytes()).hexdigest())

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('result', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = compare(args.source, args.result)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    if not report['allDecodedRecordsIdentical']:
        raise SystemExit(1)
