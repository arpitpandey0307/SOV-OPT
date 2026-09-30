# Route static-library creation through `zig ar` / `zig ranlib`.
foreach(lang C CXX)
  set(CMAKE_${lang}_ARCHIVE_CREATE "<CMAKE_AR> ar qc <TARGET> <OBJECTS>")
  set(CMAKE_${lang}_ARCHIVE_APPEND "<CMAKE_AR> ar q <TARGET> <OBJECTS>")
  set(CMAKE_${lang}_ARCHIVE_FINISH "<CMAKE_RANLIB> ranlib <TARGET>")
endforeach()
