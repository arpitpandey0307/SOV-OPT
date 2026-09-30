add_library(sovopt
    src/api/sovopt_api.cpp
    src/io/mps_reader.cpp
    src/linalg/basis_factor.cpp
    src/simplex/primal_simplex.cpp
)

target_include_directories(sovopt
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/src)

target_compile_definitions(sovopt
    PRIVATE SOVOPT_VERSION_STRING="${PROJECT_VERSION}")

add_library(sovopt::sovopt ALIAS sovopt)

# Shared library for language bindings (Python ctypes, worker processes).
add_library(sovopt_shared SHARED
    src/api/sovopt_api.cpp
    src/io/mps_reader.cpp
    src/linalg/basis_factor.cpp
    src/simplex/primal_simplex.cpp
)
target_include_directories(sovopt_shared PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_definitions(sovopt_shared PRIVATE SOVOPT_VERSION_STRING="${PROJECT_VERSION}")
set_target_properties(sovopt_shared PROPERTIES OUTPUT_NAME sovopt WINDOWS_EXPORT_ALL_SYMBOLS ON)
