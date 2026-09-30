cmake_minimum_required(VERSION 3.24)

project(sovopt
    VERSION 0.1.0
    DESCRIPTION "SOV-OPT sovereign optimization engine"
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(SOVOPT_ENABLE_CUDA   "Build GPU components (CUDA)"          OFF)
option(SOVOPT_BUILD_TESTS   "Build unit and numerical tests"       ON)
option(SOVOPT_BUILD_CLI     "Build the sovopt command-line tool"   ON)
option(SOVOPT_SANITIZE      "Enable ASan + UBSan (GCC/Clang)"      OFF)

if(SOVOPT_ENABLE_CUDA)
    enable_language(CUDA)
    set(CMAKE_CUDA_STANDARD 20)
    if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
        set(CMAKE_CUDA_ARCHITECTURES native)
    endif()
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
    if(SOVOPT_SANITIZE)
        add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
        add_link_options(-fsanitize=address,undefined)
    endif()
elseif(MSVC)
    add_compile_options(/W4 /permissive- /utf-8)
endif()

add_subdirectory(solver)

if(SOVOPT_BUILD_CLI)
    add_subdirectory(cli)
endif()

if(SOVOPT_BUILD_TESTS)
    enable_testing()
    add_subdirectory(solver/tests)
endif()
