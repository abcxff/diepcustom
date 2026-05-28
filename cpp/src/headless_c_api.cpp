#include "diepcustom/headless_c_api.h"
#include "diepcustom/headless.hpp"

#include <algorithm>
#include <cstring>
#include <exception>
#include <memory>
#include <string>
#include <vector>

struct diep_sim {
  std::unique_ptr<diepcustom::headless::Simulation> sim;
  std::vector<double> rewards;
  std::string snapshot;
  int last_error = DIEP_OK;
};

namespace {
diepcustom::headless::Config toConfig(const diep_config* config) {
  diepcustom::headless::Config out;
  if (!config) return out;
  out.seed = config->seed;
  out.agents = config->agents;
  out.maxTicks = config->max_ticks <= 0 ? out.maxTicks : config->max_ticks;
  if (config->scenario) out.scenario = config->scenario;
  return out;
}

diep_step_result emptyResult() { return diep_step_result{0, 1, 0, nullptr}; }
void setError(diep_sim* sim, int error) { if (sim) sim->last_error = error; }

std::vector<diepcustom::headless::Action> toActions(const diep_action* actions, int action_count) {
  std::vector<diepcustom::headless::Action> cppActions;
  if (actions && action_count > 0) {
    cppActions.reserve(static_cast<std::size_t>(action_count));
    for (int i = 0; i < action_count; ++i) {
      const auto& a = actions[i];
      cppActions.push_back(diepcustom::headless::Action{a.agent_id, a.move_x, a.move_y, a.aim_x, a.aim_y, a.fire != 0, a.alt_fire != 0, a.upgrade_choice});
    }
  }
  return cppActions;
}
} // namespace

extern "C" int diep_abi_version(void) { return 3; }

extern "C" int diep_last_error(diep_sim* sim) { return sim ? sim->last_error : DIEP_ERROR_NULL; }

extern "C" diep_observation_shape diep_get_observation_shape(void) { return diep_observation_shape{21, 21, 8, DIEP_LAYOUT_CHANNEL_LAST}; }

extern "C" diep_action_shape diep_get_action_shape(void) { return diep_action_shape{8, DIEP_ACTION_LAYOUT_V1_STRUCT, 1, 4, 5, 3}; }

extern "C" int diep_agent_ids(diep_sim* sim, int* buffer, int buffer_len) {
  if (!sim || !sim->sim) return DIEP_ERROR_NULL;
  try { setError(sim, DIEP_OK); return sim->sim->writeAgentIds(buffer, buffer_len); } catch (...) { setError(sim, DIEP_ERROR_EXCEPTION); return DIEP_ERROR_EXCEPTION; }
}

extern "C" int diep_alive_mask(diep_sim* sim, int* buffer, int buffer_len) {
  if (!sim || !sim->sim) return DIEP_ERROR_NULL;
  try { setError(sim, DIEP_OK); return sim->sim->writeAliveMask(buffer, buffer_len); } catch (...) { setError(sim, DIEP_ERROR_EXCEPTION); return DIEP_ERROR_EXCEPTION; }
}

extern "C" diep_sim* diep_create(const diep_config* config) {
  try {
    auto* handle = new diep_sim();
    handle->sim = std::make_unique<diepcustom::headless::Simulation>(toConfig(config));
    handle->last_error = DIEP_OK;
    return handle;
  } catch (...) {
    return nullptr;
  }
}

extern "C" void diep_destroy(diep_sim* sim) { delete sim; }

extern "C" void diep_reset(diep_sim* sim, uint64_t seed) {
  if (!sim || !sim->sim) return;
  try { sim->sim->reset(seed); setError(sim, DIEP_OK); } catch (...) { setError(sim, DIEP_ERROR_EXCEPTION); }
}

extern "C" diep_step_result diep_step(diep_sim* sim, const diep_action* actions, int action_count) {
  if (!sim || !sim->sim) return emptyResult();
  if (action_count < 0) { setError(sim, DIEP_ERROR_INVALID_ARGUMENT); return emptyResult(); }
  try {
    const auto cppActions = toActions(actions, action_count);
    const auto result = sim->sim->step(cppActions);
    setError(sim, DIEP_OK);
    sim->rewards = result.rewards;
    return diep_step_result{result.tick, result.done ? 1 : 0, static_cast<int>(sim->rewards.size()), sim->rewards.data()};
  } catch (...) {
    setError(sim, DIEP_ERROR_EXCEPTION);
    return emptyResult();
  }
}

extern "C" diep_step_result diep_step_many(diep_sim* sim, const diep_action* actions, int action_count, int ticks) {
  if (!sim || !sim->sim) return emptyResult();
  if (action_count < 0 || ticks < 0) { setError(sim, DIEP_ERROR_INVALID_ARGUMENT); return emptyResult(); }
  try {
    const auto cppActions = toActions(actions, action_count);
    const auto result = sim->sim->stepMany(cppActions, ticks);
    setError(sim, DIEP_OK);
    sim->rewards = result.rewards;
    return diep_step_result{result.tick, result.done ? 1 : 0, static_cast<int>(sim->rewards.size()), sim->rewards.data()};
  } catch (...) {
    setError(sim, DIEP_ERROR_EXCEPTION);
    return emptyResult();
  }
}

extern "C" int diep_snapshot_json(diep_sim* sim, char* buffer, int buffer_len) {
  if (!sim || !sim->sim) return DIEP_ERROR_NULL;
  try {
    sim->snapshot = sim->sim->fullWorldSnapshotJson();
    const int required = static_cast<int>(sim->snapshot.size()) + 1;
    if (!buffer || buffer_len < required) { setError(sim, DIEP_OK); return required; }
    std::memcpy(buffer, sim->snapshot.c_str(), static_cast<std::size_t>(required));
    setError(sim, DIEP_OK);
    return required;
  } catch (...) {
    setError(sim, DIEP_ERROR_EXCEPTION);
    return DIEP_ERROR_EXCEPTION;
  }
}

extern "C" int diep_observation(diep_sim* sim, int agent_id, float* buffer, int buffer_len) {
  if (!sim || !sim->sim) return DIEP_ERROR_NULL;
  try {
    const int result = sim->sim->writeObservation(agent_id, buffer, buffer_len);
    if (result < 0) { setError(sim, DIEP_ERROR_INVALID_AGENT); return DIEP_ERROR_INVALID_AGENT; }
    setError(sim, DIEP_OK);
    return result;
  } catch (...) {
    setError(sim, DIEP_ERROR_EXCEPTION);
    return DIEP_ERROR_EXCEPTION;
  }
}

extern "C" int diep_observations(diep_sim* sim, float* buffer, int buffer_len) {
  if (!sim || !sim->sim) return DIEP_ERROR_NULL;
  try {
    const int result = sim->sim->writeObservations(buffer, buffer_len);
    if (result < 0) { setError(sim, DIEP_ERROR_INVALID_AGENT); return DIEP_ERROR_INVALID_AGENT; }
    setError(sim, DIEP_OK);
    return result;
  } catch (...) {
    setError(sim, DIEP_ERROR_EXCEPTION);
    return DIEP_ERROR_EXCEPTION;
  }
}
