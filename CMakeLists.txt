cmake_minimum_required(VERSION 3.16)
project(diepcustom_cpp LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(diepcustom_protocol
  cpp/src/protocol.cpp
)

add_library(diepcustom_physics
  cpp/src/physics.cpp
)

add_library(diepcustom_entity_core
  cpp/src/entity_core.cpp
)

add_library(diepcustom_gameplay
  cpp/src/gameplay.cpp
)

add_library(diepcustom_headless
  cpp/src/headless.cpp
)

add_library(diepcustom_headless_c SHARED
  cpp/src/headless_c_api.cpp
)
target_include_directories(diepcustom_physics PUBLIC cpp/include)
target_include_directories(diepcustom_protocol PUBLIC cpp/include)
target_include_directories(diepcustom_entity_core PUBLIC cpp/include)
target_include_directories(diepcustom_gameplay PUBLIC cpp/include)
target_include_directories(diepcustom_headless PUBLIC cpp/include)
target_include_directories(diepcustom_headless_c PUBLIC cpp/include)
target_link_libraries(diepcustom_headless_c PRIVATE diepcustom_headless)
target_link_libraries(diepcustom_entity_core PUBLIC diepcustom_protocol)

add_executable(protocol_golden_test cpp/tests/protocol_golden_test.cpp)
target_link_libraries(protocol_golden_test PRIVATE diepcustom_protocol)

add_executable(protocol_report cpp/tests/protocol_report.cpp)
target_link_libraries(protocol_report PRIVATE diepcustom_protocol)

add_executable(physics_report cpp/tests/physics_report.cpp)
target_link_libraries(physics_report PRIVATE diepcustom_physics)

add_executable(entity_core_report cpp/tests/entity_core_report.cpp)
target_link_libraries(entity_core_report PRIVATE diepcustom_entity_core)

add_executable(gameplay_report cpp/tests/gameplay_report.cpp)
target_link_libraries(gameplay_report PRIVATE diepcustom_gameplay)

add_executable(headless_smoke_test cpp/tests/headless_smoke_test.cpp)
target_link_libraries(headless_smoke_test PRIVATE diepcustom_headless)

add_executable(headless_c_api_smoke_test cpp/tests/headless_c_api_smoke_test.cpp)
target_link_libraries(headless_c_api_smoke_test PRIVATE diepcustom_headless_c)

add_executable(headless_sim cpp/tools/headless_main.cpp)
target_link_libraries(headless_sim PRIVATE diepcustom_headless)

enable_testing()
add_test(NAME protocol_golden_test COMMAND protocol_golden_test)
add_test(NAME entity_core_report_smoke COMMAND entity_core_report)
add_test(NAME gameplay_report_smoke COMMAND gameplay_report)
add_test(NAME headless_smoke_test COMMAND headless_smoke_test)
add_test(NAME headless_c_api_smoke_test COMMAND headless_c_api_smoke_test)
