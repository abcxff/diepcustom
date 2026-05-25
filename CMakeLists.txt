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
target_include_directories(diepcustom_physics PUBLIC cpp/include)
target_include_directories(diepcustom_protocol PUBLIC cpp/include)

add_executable(protocol_golden_test cpp/tests/protocol_golden_test.cpp)
target_link_libraries(protocol_golden_test PRIVATE diepcustom_protocol)

add_executable(protocol_report cpp/tests/protocol_report.cpp)
target_link_libraries(protocol_report PRIVATE diepcustom_protocol)

add_executable(physics_report cpp/tests/physics_report.cpp)
target_link_libraries(physics_report PRIVATE diepcustom_physics)

enable_testing()
add_test(NAME protocol_golden_test COMMAND protocol_golden_test)
