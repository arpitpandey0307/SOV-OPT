add_executable(sovopt_cli main.cpp)
target_link_libraries(sovopt_cli PRIVATE sovopt::sovopt)
set_target_properties(sovopt_cli PROPERTIES OUTPUT_NAME sovopt)
