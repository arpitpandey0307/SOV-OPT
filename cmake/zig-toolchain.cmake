# Toolchain file for building with Zig's bundled clang (no admin install needed):
#   pip install ziglang cmake ninja
#   cmake --preset release-zig
# The zig executable is located through the Python package unless ZIG_EXE is set.

if(NOT ZIG_EXE)
  execute_process(
    COMMAND python -c "import ziglang, os; print(os.path.join(os.path.dirname(ziglang.__file__), 'zig'))"
    OUTPUT_VARIABLE ZIG_EXE OUTPUT_STRIP_TRAILING_WHITESPACE)
  if(WIN32)
    set(ZIG_EXE "${ZIG_EXE}.exe")
  endif()
endif()
file(TO_CMAKE_PATH "${ZIG_EXE}" ZIG_EXE)

set(CMAKE_C_COMPILER "${ZIG_EXE}")
set(CMAKE_C_COMPILER_ARG1 cc)
set(CMAKE_CXX_COMPILER "${ZIG_EXE}")
set(CMAKE_CXX_COMPILER_ARG1 c++)
set(CMAKE_AR "${ZIG_EXE}" CACHE FILEPATH "" FORCE)
set(CMAKE_RANLIB "${ZIG_EXE}" CACHE FILEPATH "" FORCE)

# Archive rules must be set after CMake's platform defaults, so they live in an override file.
set(CMAKE_USER_MAKE_RULES_OVERRIDE "${CMAKE_CURRENT_LIST_DIR}/zig-rules.cmake")
