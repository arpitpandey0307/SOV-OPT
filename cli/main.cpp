#include <cstdio>
#include <cstring>

#include "sovopt/sovopt.h"

namespace {

void print_usage() {
    std::printf(
        "SOV-OPT %s\n"
        "\n"
        "Usage:\n"
        "  sovopt --version\n"
        "  sovopt solve <model.mps> [options]   (not yet implemented)\n",
        sovopt_version());
}

}  // namespace

int main(int argc, char** argv) {
    if (argc >= 2 && std::strcmp(argv[1], "--version") == 0) {
        std::printf("%s\n", sovopt_version());
        return 0;
    }
    print_usage();
    return argc >= 2 ? 1 : 0;
}
