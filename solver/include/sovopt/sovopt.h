/*
 * SOV-OPT public C API.
 *
 * This is the only stable interface to the solver. The CLI, Python bindings,
 * worker processes and adapters all go through it.
 */
#ifndef SOVOPT_H
#define SOVOPT_H

#ifdef __cplusplus
extern "C" {
#endif

typedef enum sovopt_status {
    SOVOPT_STATUS_NOT_SOLVED        = 0,
    SOVOPT_STATUS_OPTIMAL           = 1,
    SOVOPT_STATUS_INFEASIBLE        = 2,
    SOVOPT_STATUS_UNBOUNDED         = 3,
    SOVOPT_STATUS_INF_OR_UNBD       = 4,
    SOVOPT_STATUS_TIME_LIMIT        = 5,
    SOVOPT_STATUS_ITERATION_LIMIT   = 6,
    SOVOPT_STATUS_NODE_LIMIT        = 7,
    SOVOPT_STATUS_NUMERICAL_ERROR   = 8,
    SOVOPT_STATUS_INTERRUPTED       = 9
} sovopt_status;

/* Returns the solver version string, e.g. "0.1.0". */
const char* sovopt_version(void);

/* Returns a human-readable name for a status code. */
const char* sovopt_status_name(sovopt_status status);

#ifdef __cplusplus
}
#endif

#endif /* SOVOPT_H */
