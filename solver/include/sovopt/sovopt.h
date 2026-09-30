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

typedef struct sovopt_model sovopt_model;

typedef struct sovopt_params {
    double time_limit;          /* seconds */
    long long iteration_limit;
    int scale;                  /* 1 = geometric scaling */
    int perturb;                /* 1 = cost perturbation against degeneracy */
    unsigned seed;
} sovopt_params;

typedef struct sovopt_result {
    sovopt_status status;
    double objective;
    long long iterations;
    long long phase1_iterations;
    int refactorizations;
    double elapsed;
    double max_primal_violation;
    double max_dual_violation;
} sovopt_result;

/* Receives one JSON object per solver event (progress, scaling, numerical notes). */
typedef void (*sovopt_event_callback)(const char* event_json, void* user);

/* Returns the solver version string, e.g. "0.1.0". */
const char* sovopt_version(void);

/* Returns a human-readable name for a status code. */
const char* sovopt_status_name(sovopt_status status);

/* Reads an MPS file. Returns 0 on success; on failure writes a message to err. */
int sovopt_read_mps(const char* path, sovopt_model** out, char* err, int err_len);
void sovopt_free_model(sovopt_model* model);

int sovopt_num_rows(const sovopt_model* model);
int sovopt_num_cols(const sovopt_model* model);
long long sovopt_num_nonzeros(const sovopt_model* model);
int sovopt_num_integers(const sovopt_model* model);

void sovopt_default_params(sovopt_params* params);

/* Solves the LP (relaxation). Integer markers are ignored until the MILP engine lands. */
int sovopt_solve(sovopt_model* model, const sovopt_params* params, sovopt_event_callback cb, void* user,
                 sovopt_result* result);

/* Writes the last solution: column values and reduced costs, row activities and duals. */
int sovopt_write_solution(const sovopt_model* model, const char* path);

#ifdef __cplusplus
}
#endif

#endif /* SOVOPT_H */
