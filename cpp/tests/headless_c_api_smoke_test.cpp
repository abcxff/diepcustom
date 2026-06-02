#include "diepcustom/headless_c_api.h"

#include <cassert>
#include <cstring>
#include <string>
#include <vector>

int main() {
  assert(diep_abi_version() == 6);
  const auto obsShape = diep_get_observation_shape();
  assert(obsShape.rows == 21 && obsShape.cols == 21 && obsShape.channels == 8 && obsShape.layout == DIEP_LAYOUT_CHANNEL_LAST);
  const auto actionShape = diep_get_action_shape();
  assert(actionShape.fields == 9 && actionShape.layout == DIEP_ACTION_LAYOUT_V1_STRUCT);

  diep_config config{123, 2, 16, "rl-grid-smoke"};
  diep_sim* sim = diep_create(&config);
  assert(sim != nullptr);

  int needed = diep_snapshot_json(sim, nullptr, 0);
  assert(needed > 1);
  std::vector<char> snapshot(static_cast<std::size_t>(needed));
  assert(diep_snapshot_json(sim, snapshot.data(), needed) == needed);
  assert(std::string(snapshot.data()).find("rl-grid-smoke") != std::string::npos);

  int idNeeded = diep_agent_ids(sim, nullptr, 0);
  assert(idNeeded == 2);
  std::vector<int> ids(static_cast<std::size_t>(idNeeded));
  assert(diep_agent_ids(sim, ids.data(), idNeeded) == idNeeded);
  assert(ids[0] == 0 && ids[1] == 1);

  int maskNeeded = diep_alive_mask(sim, nullptr, 0);
  assert(maskNeeded == 2);
  std::vector<int> mask(static_cast<std::size_t>(maskNeeded));
  assert(diep_alive_mask(sim, mask.data(), maskNeeded) == maskNeeded);
  assert(mask[0] == 1 && mask[1] == 1);

  int obsNeeded = diep_observation(sim, 0, nullptr, 0);
  assert(obsNeeded == 21 * 21 * 8);
  std::vector<float> obs(static_cast<std::size_t>(obsNeeded));
  assert(diep_observation(sim, 0, obs.data(), obsNeeded) == obsNeeded);
  int allObsNeeded = diep_observations(sim, nullptr, 0);
  assert(allObsNeeded == 2 * 21 * 21 * 8);
  std::vector<float> allObs(static_cast<std::size_t>(allObsNeeded));
  assert(diep_observations(sim, allObs.data(), allObsNeeded) == allObsNeeded);
  assert(diep_agent_state_fields() == 10);
  const int statesNeeded = diep_agent_states(sim, nullptr, 0);
  assert(statesNeeded == 2 * diep_agent_state_fields());
  std::vector<float> states(static_cast<std::size_t>(statesNeeded), -1.0f);
  assert(diep_agent_states(sim, states.data(), statesNeeded) == statesNeeded);
  assert(states[0] == 0.0f);
  assert(states[1] == 1.0f);
  assert(states[6] > 0.0f);
  assert(diep_agent_progression_fields() == 27);
  const int progressionsNeeded = diep_agent_progressions(sim, nullptr, 0);
  assert(progressionsNeeded == 2 * diep_agent_progression_fields());
  std::vector<float> progressions(static_cast<std::size_t>(progressionsNeeded), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), progressionsNeeded) == progressionsNeeded);
  assert(progressions[0] == 1.0f);
  assert(progressions[1] == 0.0f);
  assert(progressions[2] == 0.0f);
  assert(progressions[3] == 0.0f);
  assert(progressions[4] == 0.0f);
  for (int i = 5; i < 27; ++i) assert(progressions[i] == 0.0f);
  assert(diep_observation(sim, 9999, obs.data(), obsNeeded) == DIEP_ERROR_INVALID_AGENT);
  assert(diep_last_error(sim) == DIEP_ERROR_INVALID_AGENT);

  diep_action actions[1] = {{0, 1.0, 0.0, 1.0, 0.0, 1, 0, -1, -1}};
  diep_step_result result = diep_step(sim, actions, 1);
  assert(result.tick == 1);
  assert(result.reward_count == 2);
  assert(result.rewards != nullptr);
  result = diep_step_many(sim, actions, 1, 3);
  assert(result.tick == 4);
  assert(result.reward_count == 2);
  assert(result.rewards != nullptr);

  diep_destroy(sim);

  diep_config denseConfig{1, 4, 200, "dense-collision"};
  sim = diep_create(&denseConfig);
  assert(sim != nullptr);
  const int denseObsNeeded = diep_observations(sim, nullptr, 0);
  assert(denseObsNeeded == 4 * 21 * 21 * 8);
  std::vector<int> denseIds(4);
  assert(diep_agent_ids(sim, denseIds.data(), 4) == 4);
  std::vector<diep_action> denseActions;
  for (int id : denseIds) denseActions.push_back(diep_action{id, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, -1});
  result = diep_step_many(sim, denseActions.data(), static_cast<int>(denseActions.size()), 10);
  assert(result.tick >= 6 && result.tick <= 10);
  std::vector<int> deadMask(4);
  assert(diep_alive_mask(sim, deadMask.data(), 4) == 4);
  assert(deadMask[0] == 0 && deadMask[1] == 0 && deadMask[2] == 0 && deadMask[3] == 0);
  assert(diep_observations(sim, nullptr, 0) == denseObsNeeded);
  std::vector<float> denseObs(static_cast<std::size_t>(denseObsNeeded));
  assert(diep_observations(sim, denseObs.data(), denseObsNeeded) == denseObsNeeded);
  for (float value : denseObs) assert(value == 0.0f);
  diep_destroy(sim);

  sim = diep_create(&config);
  assert(sim != nullptr);
  diep_reset(sim, 456);
  needed = diep_snapshot_json(sim, nullptr, 0);
  assert(needed > 1);
  diep_destroy(sim);

  diep_config upgradeConfig{123, 1, 8, "upgrade-ready"};
  sim = diep_create(&upgradeConfig);
  assert(sim != nullptr);
  progressions.assign(static_cast<std::size_t>(diep_agent_progression_fields()), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), diep_agent_progression_fields()) == diep_agent_progression_fields());
  assert(progressions[0] == 45.0f);
  assert(progressions[2] > 0.0f);
  assert(progressions[3] == 1.0f);
  assert(progressions[4] == 1.0f);
  assert(progressions[13] == 1.0f);
  assert(progressions[21] == 1.0f);
  const float initialStatsAvailable = progressions[2];
  diep_action upgradeActions[1] = {{0, 0.0, 0.0, 1.0, 0.0, 0, 0, 0, -1}};
  result = diep_step(sim, upgradeActions, 1);
  assert(result.tick == 1);
  progressions.assign(static_cast<std::size_t>(diep_agent_progression_fields()), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), diep_agent_progression_fields()) == diep_agent_progression_fields());
  assert(progressions[2] == initialStatsAvailable - 1.0f);
  assert(progressions[5] == 1.0f);
  upgradeActions[0] = diep_action{0, 0.0, 0.0, 1.0, 0.0, 0, 0, 99, -1};
  result = diep_step(sim, upgradeActions, 1);
  progressions.assign(static_cast<std::size_t>(diep_agent_progression_fields()), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), diep_agent_progression_fields()) == diep_agent_progression_fields());
  assert(progressions[5] == 1.0f);
  upgradeActions[0] = diep_action{0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 0};
  result = diep_step(sim, upgradeActions, 1);
  progressions.assign(static_cast<std::size_t>(diep_agent_progression_fields()), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), diep_agent_progression_fields()) == diep_agent_progression_fields());
  assert(progressions[1] == 1.0f);
  upgradeActions[0] = diep_action{0, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, 5};
  result = diep_step(sim, upgradeActions, 1);
  progressions.assign(static_cast<std::size_t>(diep_agent_progression_fields()), -1.0f);
  assert(diep_agent_progressions(sim, progressions.data(), diep_agent_progression_fields()) == diep_agent_progression_fields());
  assert(progressions[1] == 1.0f);
  diep_destroy(sim);

  diep_destroy(nullptr);
  assert(diep_step(nullptr, nullptr, 0).done == 1);
  return 0;
}
