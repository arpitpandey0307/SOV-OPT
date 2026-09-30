# emps

`emps.c` is David M. Gay's Netlib decoder for the compressed MPS format that Netlib LP files are
distributed in (source: https://www.netlib.org/lp/data/emps.c). It is a data-preparation tool
only: it is not part of, and is never linked into, the SOV-OPT solver.

```bash
gcc -O2 -o emps emps.c
./emps afiro.txt > afiro.mps
```

The control plane builds `tools/emps/emps.exe` output into `backend/.cache/netlib/` on start.
