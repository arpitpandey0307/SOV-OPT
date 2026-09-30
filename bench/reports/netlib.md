# netlib benchmark: SOV-OPT vs HiGHS

Generated 2026-09-30 18:46:07 on Windows-11-10.0.26200-SP0. Time limit 60 s per model.
Solved means optimal, within 1e-6 of the published objective, and certified by the independent verifier.

| | SOV-OPT | HiGHS |
|---|---|---|
| Solved | 5 / 5 | 5 / 5 |
| Shifted geometric mean time (s, shift 10) | 0.218 | 0.010 |

| Model | Reference | SOV-OPT objective | Rel. error | Status | Verifier | Time (s) | HiGHS time (s) |
|---|---|---|---|---|---|---|---|
| adlittle | 225494.9632 | 225494.9632 | 1.1e-11 | OPTIMAL | OPTIMALITY_PROVED | 0.001 | 0.003 |
| afiro | -464.7531429 | -464.7531429 | 6.1e-12 | OPTIMAL | OPTIMALITY_PROVED | 0.000 | 0.000 |
| blend | -30.81214985 | -30.81214985 | 5.6e-12 | OPTIMAL | OPTIMALITY_PROVED | 0.001 | 0.001 |
| degen2 | -1435.178 | -1435.178 | 1.6e-16 | OPTIMAL | OPTIMALITY_PROVED | 0.200 | 0.009 |
| perold | -9380.755278 | -9380.755278 | 3.7e-12 | OPTIMAL | OPTIMALITY_PROVED | 0.916 | 0.037 |
