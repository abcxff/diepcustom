#include "diepcustom/headless.hpp"

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using diepcustom::headless::Action;
using diepcustom::headless::Config;
using diepcustom::headless::Simulation;

namespace {
std::string valueAfterEquals(const std::string& arg, const std::string& name) {
  const std::string prefix = "--" + name + "=";
  if (arg.rfind(prefix, 0) == 0) return arg.substr(prefix.size());
  return "";
}

int parseInt(const std::string& value, const std::string& name) {
  char* end = nullptr;
  const long parsed = std::strtol(value.c_str(), &end, 10);
  if (!end || *end != '\0') throw std::invalid_argument("invalid integer for " + name);
  return static_cast<int>(parsed);
}

std::uint64_t parseU64(const std::string& value, const std::string& name) {
  char* end = nullptr;
  const unsigned long long parsed = std::strtoull(value.c_str(), &end, 10);
  if (!end || *end != '\0') throw std::invalid_argument("invalid integer for " + name);
  return static_cast<std::uint64_t>(parsed);
}

std::string jsonString(const std::string& input) {
  std::ostringstream out;
  out << '"';
  for (const unsigned char c : input) {
    switch (c) {
      case '"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\b': out << "\\b"; break;
      case '\f': out << "\\f"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (c < 0x20) {
          static const char* hex = "0123456789abcdef";
          out << "\\u00" << hex[c >> 4] << hex[c & 0x0f];
        } else {
          out << static_cast<char>(c);
        }
    }
  }
  out << '"';
  return out.str();
}

std::vector<Action> scriptedActions(const Simulation& sim, int tick) {
  std::vector<Action> actions;
  const int agents = sim.config().agents;
  actions.reserve(static_cast<std::size_t>(std::max(0, agents)));
  for (int i = 0; i < agents; ++i) {
    const double dir = (i % 2 == 0) ? 1.0 : -1.0;
    actions.push_back(Action{i, dir, (i % 3) - 1.0, dir, 0.25 * (i + 1), sim.config().scenario != "agents-no-fire" && tick % (6 + (i % 3)) == 0, false, 0});
  }
  return actions;
}
} // namespace

int main(int argc, char** argv) {
  try {
    Config config;
    bool snapshotJson = false;
    bool reportJson = true;
    bool observeAll = false;
    double observationChecksum = 0;
    int ticks = config.maxTicks;
    for (int i = 1; i < argc; ++i) {
      const std::string arg = argv[i];
      if (arg == "--snapshot-json") snapshotJson = true;
      else if (arg == "--no-report-json") reportJson = false;
      else if (arg == "--observe-all") observeAll = true;
      else if (auto value = valueAfterEquals(arg, "seed"); !value.empty()) config.seed = parseU64(value, "seed");
      else if (auto value = valueAfterEquals(arg, "agents"); !value.empty()) config.agents = parseInt(value, "agents");
      else if (auto value = valueAfterEquals(arg, "ticks"); !value.empty()) ticks = parseInt(value, "ticks");
      else if (auto value = valueAfterEquals(arg, "scenario"); !value.empty()) config.scenario = value;
      else throw std::invalid_argument("unknown argument: " + arg);
    }
    config.maxTicks = std::max(1, ticks);
    Simulation sim(config);
    const auto start = std::chrono::steady_clock::now();
    for (int tick = 0; tick < config.maxTicks; ++tick) {
      sim.step(scriptedActions(sim, tick));
      if (observeAll) {
        const int count = sim.observationFloatCount();
        std::vector<float> observation(static_cast<std::size_t>(count));
        for (int agent = 0; agent < sim.config().agents; ++agent) {
          if (sim.writeObservation(agent, observation.data(), count) == count) {
            for (float value : observation) observationChecksum += value;
          }
        }
      }
    }
    const auto end = std::chrono::steady_clock::now();
    const double elapsedMs = std::chrono::duration<double, std::milli>(end - start).count();
    if (snapshotJson) std::cout << sim.fullWorldSnapshotJson() << "\n";
    if (reportJson) {
      if (observeAll) std::cout << "{\"scenario\":" << jsonString(sim.config().scenario) << ",\"seed\":" << sim.config().seed << ",\"agents\":" << sim.config().agents << ",\"ticks\":" << sim.tick() << ",\"activeEntities\":" << sim.activeEntityCount() << ",\"elapsedMs\":" << elapsedMs << ",\"ticksPerSecond\":" << (elapsedMs <= 0 ? 0 : (static_cast<double>(sim.tick()) / elapsedMs) * 1000.0) << ",\"observationChecksum\":" << observationChecksum << "}\n";
      else std::cout << sim.finalReportJson(elapsedMs) << "\n";
    }
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "headless_sim: " << error.what() << "\n";
    return 1;
  }
}
