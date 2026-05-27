#include "diepcustom/headless.hpp"

#include <cassert>
#include <iostream>
#include <string>
#include <vector>

using diepcustom::headless::Action;
using diepcustom::headless::Config;
using diepcustom::headless::Simulation;

std::string runScript(std::uint64_t seed, int ticks, const std::string& scenario) {
  Simulation sim(Config{seed, 3, ticks, scenario});
  for (int tick = 0; tick < ticks; ++tick) {
    std::vector<Action> actions;
    actions.push_back(Action{0, 1.0, 0.0, 1.0, 0.0, tick % 4 == 0, false, 0});
    actions.push_back(Action{1, -0.5, 0.25, -1.0, 0.0, tick % 5 == 0, false, 0});
    actions.push_back(Action{2, 0.0, -1.0, 0.0, -1.0, tick % 7 == 0, true, 0});
    const auto result = sim.step(actions);
    assert(result.tick == tick + 1);
    assert(result.rewards.size() == 3);
  }
  return sim.fullWorldSnapshotJson();
}

int main() {
  const std::string a = runScript(123, 32, "agents-projectiles");
  const std::string b = runScript(123, 32, "agents-projectiles");
  const std::string c = runScript(124, 32, "agents-projectiles");
  assert(a == b);
  assert(a != c);

  Simulation empty(Config{123, 0, 5, "empty-arena"});
  const auto done = empty.step({});
  assert(done.done);
  assert(empty.activeEntityCount() == 0);

  std::cout << "headless deterministic smoke passed\n";
  return 0;
}
