# clang -O2 -o freq freq.c -framework CoreFoundation -lIOReport; python3 clocks.py <seconds>: average active GPU / P-cluster / E-cluster clock (MHz) and the top state used.
import plistlib, struct, subprocess, sys, re
d = plistlib.loads(subprocess.run(['ioreg', '-r', '-n', 'pmgr', '-l', '-a'], capture_output=True).stdout); T = {}
def walk(x):
    if isinstance(x, dict):
        for k, v in x.items():
            if isinstance(v, bytes) and k.startswith('voltage-states'): T[k] = struct.unpack('<%dI' % (len(v) // 4), v)[0::2]
            else: walk(v)
    elif isinstance(x, list): [walk(v) for v in x]
walk(d)
gpu = [f / 1e6 for f in T['voltage-states9-sram'] if f]; pc = [f / 1e3 for f in T['voltage-states5-sram']]; ec = [f / 1e3 for f in T['voltage-states1-sram']]
out = subprocess.run([sys.path[0] + '/freq', sys.argv[1] if len(sys.argv) > 1 else '3'], capture_output=True, text=True).stdout
def avg(line, table):
    st = re.findall(r' (\S+)=(\d+)', line); act = [(n, int(r)) for n, r in st if n not in ('OFF', 'IDLE', 'DOWN', 'NON_IDLE')]
    tot = sum(r for _, r in act); allr = sum(int(r) for _, r in st)
    if not tot: return '-'
    a = sum(table[min(i, len(table) - 1)] * r for i, (_, r) in enumerate(act)) / tot; top = max((i for i, (_, r) in enumerate(act) if r), default=0)
    return f'{a:6.0f} MHz avg active (top {table[min(top, len(table) - 1)]:.0f}, max {table[-1]:.0f}), active {100 * tot / allr:3.0f}%'
for line in out.splitlines():
    name = line.split('|')[2].split(' ')[0]
    if name == 'GPUPH': print('GPU  ', avg(line, gpu))
    if name == 'PCPU': print('PCPU ', avg(line, pc))
    if name == 'ECPU': print('ECPU ', avg(line, ec))
