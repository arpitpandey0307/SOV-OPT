add_library(sovopt
    src/api/sovopt_api.cpp
)

target_include_directories(sovopt
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)

target_compile_definitions(sovopt
    PRIVATE SOVOPT_VERSION_STRING="${PROJECT_VERSION}")

add_library(sovopt::sovopt ALIAS sovopt)
