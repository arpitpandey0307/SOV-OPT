#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

#include "sovopt/sovopt.h"

namespace {

void print_usage() {
    std::printf(
        "SOV-OPT %s\n"
        "\n"
        "Usage:\n"
        "  sovopt --version\n"
        "  sovopt solve <model.mps> [options]\n"
        "\n"
        "Options:\n"
        "  --time-limit <seconds>   stop after this many seconds (default 60)\n"
        "  --solution <path>        write column values, reduced costs, row activities and duals\n"
        "  --events                 print one JSON object per solver event on stdout\n"
        "  --no-scale               disable geometric scaling\n"
        "  --no-perturb             disable cost perturbation\n"
        "  --seed <n>               random seed (default 42)\n",
        sovopt_version());
}

void print_event(const char* json, void*) {
    std::fputs(json, stdout);
    std::fputc('\n', stdout);
    std::fflush(stdout);
}

int solve(int argc, char** argv) {
    if (argc < 3) {
        print_usage();
        return 2;
    }
    const char* path = argv[2];
    const char* solution_path = nullptr;
    bool events = false;
    sovopt_params params;
    sovopt_default_params(&params);
    for (int i = 3; i < argc; ++i) {
        std::string a = argv[i];
        if (a == "--time-limit" && i + 1 < argc) params.time_limit = std::atof(argv[++i]);
        else if (a == "--solution" && i + 1 < argc) solution_path = argv[++i];
        else if (a == "--events") events = true;
        else if (a == "--no-scale") params.scale = 0;
        else if (a == "--no-perturb") params.perturb = 0;
        else if (a == "--seed" && i + 1 < argc) params.seed = static_cast<unsigned>(std::atoi(argv[++i]));
        else {
            std::fprintf(stderr, "unknown option %s\n", a.c_str());
            return 2;
        }
    }

    char err[512];
    sovopt_model* model = nullptr;
    if (sovopt_read_mps(path, &model, err, sizeof err) != 0) {
        if (events) std::printf("{\"type\":\"RUN_FAILED\",\"message\":\"%s\"}\n", err);
        else std::fprintf(stderr, "error: %s\n", err);
        return 1;
    }
    if (events) {
        std::printf("{\"type\":\"MODEL_READ\",\"rows\":%d,\"cols\":%d,\"nnz\":%lld,\"integers\":%d}\n", sovopt_num_rows(model),
                    sovopt_num_cols(model), sovopt_num_nonzeros(model), sovopt_num_integers(model));
        std::fflush(stdout);
    } else {
        std::printf("Model: %d rows, %d columns, %lld nonzeros\n", sovopt_num_rows(model), sovopt_num_cols(model),
                    sovopt_num_nonzeros(model));
    }

    sovopt_result r;
    sovopt_solve(model, &params, events ? print_event : nullptr, nullptr, &r);

    int rc = 0;
    if (solution_path && sovopt_write_solution(model, solution_path) != 0) {
        std::fprintf(stderr, "error: cannot write %s\n", solution_path);
        rc = 1;
    }
    if (events) {
        std::printf(
            "{\"type\":\"RESULT\",\"status\":\"%s\",\"objective\":%.17g,\"iterations\":%lld,\"phase1_iterations\":%lld,"
            "\"refactorizations\":%d,\"elapsed\":%.6f,\"max_primal_violation\":%.3e,\"max_dual_violation\":%.3e}\n",
            sovopt_status_name(r.status), r.objective, r.iterations, r.phase1_iterations, r.refactorizations, r.elapsed,
            r.max_primal_violation, r.max_dual_violation);
    } else {
        std::printf("Status: %s\nObjective: %.12g\nIterations: %lld (phase 1: %lld)\nTime: %.3f s\n"
                    "Max primal violation: %.2e\nMax dual violation: %.2e\n",
                    sovopt_status_name(r.status), r.objective, r.iterations, r.phase1_iterations, r.elapsed,
                    r.max_primal_violation, r.max_dual_violation);
    }
    sovopt_free_model(model);
    return rc;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc >= 2 && std::strcmp(argv[1], "--version") == 0) {
        std::printf("%s\n", sovopt_version());
        return 0;
    }
    if (argc >= 2 && std::strcmp(argv[1], "solve") == 0) return solve(argc, argv);
    print_usage();
    return argc >= 2 ? 2 : 0;
}
