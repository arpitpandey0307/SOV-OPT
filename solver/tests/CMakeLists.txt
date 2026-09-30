include(FetchContent)

# GoogleTest is a test framework only; it is never linked into the solver library.
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/archive/refs/tags/v1.15.2.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(sovopt_tests
    test_api.cpp
)
target_link_libraries(sovopt_tests PRIVATE sovopt::sovopt GTest::gtest_main)

include(GoogleTest)
gtest_discover_tests(sovopt_tests)
