#include "diepcustom/headless_c_api.h"

#include <algorithm>
#include <cassert>
#include <cstring>
#include <string>
#include <vector>

namespace {
constexpr int EpisodeStatsFieldCount = 14;
constexpr int CombatChannelCount = 18;
constexpr int LifetimeStepsIndex = 0;
constexpr int ShotsFiredIndex = 6;
constexpr int DamageDealtIndex = 4;
constexpr int DamageTakenIndex = 5;
constexpr int DeathCountIndex = 9;
constexpr int DeathCauseIndex = 10;
constexpr int LevelReachedIndex = 11;
constexpr int TankClassIndex = 12;
constexpr int UpgradeChoicesIndex = 13;
}

int main() {
  assert(diep_abi_version() == 10);
  const auto combatShape = diep_get_combat_observation_shape();
  assert(combatShape.channels == CombatChannelCount && combatShape.rows == 21 && combatShape.cols == 21 && combatShape.layout == DIEP_LAYOUT_CHANNEL_FIRST);
  const auto actionShape = diep_get_action_shape();
  assert(actionShape.fields == 9 && actionShape.layout == DIEP_ACTION_LAYOUT_V1_STRUCT);
  assert(diep_combat_self_fields() == 27);
  assert(diep_combat_prev_action_fields() == 5);
  assert(diep_episode_stats_fields() == EpisodeStatsFieldCount);

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

  const int statsNeeded = diep_episode_stats(sim, nullptr, 0);
  assert(statsNeeded == 2 * EpisodeStatsFieldCount);
  std::vector<double> episodeStats(static_cast<std::size_t>(statsNeeded), -1.0);
  assert(diep_episode_stats(sim, episodeStats.data(), statsNeeded) == statsNeeded);
  for (int i = 0; i < 2; ++i) {
    const std::size_t offset = static_cast<std::size_t>(i * EpisodeStatsFieldCount);
    assert(episodeStats[offset + LifetimeStepsIndex] == 0.0);
    assert(episodeStats[offset + LevelReachedIndex] == 1.0);
    assert(episodeStats[offset + TankClassIndex] == 0.0);
    assert(episodeStats[offset + UpgradeChoicesIndex] == 0.0);
  }

  const int combatObsNeeded = diep_combat_observation(sim, 0, nullptr, 0);
  assert(combatObsNeeded == CombatChannelCount * 21 * 21);
  std::vector<float> combatObs(static_cast<std::size_t>(combatObsNeeded), -1.0f);
  assert(diep_combat_observation(sim, 0, combatObs.data(), combatObsNeeded) == combatObsNeeded);
  assert(std::any_of(combatObs.begin(), combatObs.end(), [](float value) { return value > 0.0f; }));
  const int allCombatObsNeeded = diep_combat_observations(sim, nullptr, 0);
  assert(allCombatObsNeeded == 2 * combatObsNeeded);
  std::vector<float> allCombatObs(static_cast<std::size_t>(allCombatObsNeeded), -1.0f);
  assert(diep_combat_observations(sim, allCombatObs.data(), allCombatObsNeeded) == allCombatObsNeeded);
  const int combatSelfNeeded = diep_combat_self_observation(sim, 0, nullptr, 0);
  assert(combatSelfNeeded == diep_combat_self_fields());
  std::vector<float> combatSelf(static_cast<std::size_t>(combatSelfNeeded), -1.0f);
  assert(diep_combat_self_observation(sim, 0, combatSelf.data(), combatSelfNeeded) == combatSelfNeeded);
  assert(combatSelf[0] == 1.0f);
  assert(combatSelf[8] > 0.0f);
  const int allCombatSelfNeeded = diep_combat_self_observations(sim, nullptr, 0);
  assert(allCombatSelfNeeded == 2 * combatSelfNeeded);
  std::vector<float> allCombatSelf(static_cast<std::size_t>(allCombatSelfNeeded), -1.0f);
  assert(diep_combat_self_observations(sim, allCombatSelf.data(), allCombatSelfNeeded) == allCombatSelfNeeded);
  const int combatPrevNeeded = diep_combat_prev_action_observation(sim, 0, nullptr, 0);
  assert(combatPrevNeeded == diep_combat_prev_action_fields());
  std::vector<float> combatPrev(static_cast<std::size_t>(combatPrevNeeded), -1.0f);
  assert(diep_combat_prev_action_observation(sim, 0, combatPrev.data(), combatPrevNeeded) == combatPrevNeeded);
  for (float value : combatPrev) assert(value == 0.0f);
  const int allCombatPrevNeeded = diep_combat_prev_action_observations(sim, nullptr, 0);
  assert(allCombatPrevNeeded == 2 * combatPrevNeeded);
  std::vector<float> allCombatPrev(static_cast<std::size_t>(allCombatPrevNeeded), -1.0f);
  assert(diep_combat_prev_action_observations(sim, allCombatPrev.data(), allCombatPrevNeeded) == allCombatPrevNeeded);
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
  assert(diep_combat_observation(sim, 9999, combatObs.data(), combatObsNeeded) == DIEP_ERROR_INVALID_AGENT);
  assert(diep_last_error(sim) == DIEP_ERROR_INVALID_AGENT);

  diep_action actions[1] = {{0, 1.0, 0.0, 1.0, 0.0, 1, 0, -1, -1}};
  diep_step_result result = diep_step(sim, actions, 1);
  assert(result.tick == 1);
  assert(result.reward_count == 2);
  assert(result.rewards != nullptr);
  std::fill(combatPrev.begin(), combatPrev.end(), -1.0f);
  assert(diep_combat_prev_action_observation(sim, 0, combatPrev.data(), combatPrevNeeded) == combatPrevNeeded);
  assert(combatPrev[0] == 1.0f);
  assert(combatPrev[1] == 0.0f);
  assert(combatPrev[2] == 1.0f);
  assert(combatPrev[3] == 0.0f);
  assert(combatPrev[4] == 1.0f);
  std::fill(episodeStats.begin(), episodeStats.end(), -1.0);
  assert(diep_episode_stats(sim, episodeStats.data(), statsNeeded) == statsNeeded);
  assert(episodeStats[LifetimeStepsIndex] == 1.0);
  assert(episodeStats[ShotsFiredIndex] == 1.0);
  result = diep_step_many(sim, actions, 1, 3);
  assert(result.tick == 4);
  assert(result.reward_count == 2);
  assert(result.rewards != nullptr);

  diep_destroy(sim);

  diep_config denseConfig{1, 4, 200, "dense-collision"};
  sim = diep_create(&denseConfig);
  assert(sim != nullptr);
  std::vector<int> denseIds(4);
  assert(diep_agent_ids(sim, denseIds.data(), 4) == 4);
  std::vector<diep_action> denseActions;
  for (int id : denseIds) denseActions.push_back(diep_action{id, 0.0, 0.0, 1.0, 0.0, 0, 0, -1, -1});
  result = diep_step_many(sim, denseActions.data(), static_cast<int>(denseActions.size()), 10);
  assert(result.tick >= 6 && result.tick <= 10);
  std::vector<int> deadMask(4);
  assert(diep_alive_mask(sim, deadMask.data(), 4) == 4);
  assert(deadMask[0] == 0 && deadMask[1] == 0 && deadMask[2] == 0 && deadMask[3] == 0);
  std::vector<double> denseStats(static_cast<std::size_t>(4 * EpisodeStatsFieldCount), -1.0);
  assert(diep_episode_stats(sim, denseStats.data(), static_cast<int>(denseStats.size())) == static_cast<int>(denseStats.size()));
  double deathCountSum = 0.0;
  double damageDealtSum = 0.0;
  double damageTakenSum = 0.0;
  for (int i = 0; i < 4; ++i) {
    const std::size_t offset = static_cast<std::size_t>(i * EpisodeStatsFieldCount);
    deathCountSum += denseStats[offset + DeathCountIndex];
    damageDealtSum += denseStats[offset + DamageDealtIndex];
    damageTakenSum += denseStats[offset + DamageTakenIndex];
    assert(denseStats[offset + DeathCauseIndex] == 0.0 || denseStats[offset + DeathCauseIndex] == 2.0);
  }
  assert(deathCountSum == 4.0);
  assert(damageDealtSum > 0.0);
  assert(damageTakenSum > 0.0);
  std::vector<float> denseCombatObs(static_cast<std::size_t>(4 * CombatChannelCount * 21 * 21), -1.0f);
  assert(diep_combat_observations(sim, denseCombatObs.data(), static_cast<int>(denseCombatObs.size())) == static_cast<int>(denseCombatObs.size()));
  for (float value : denseCombatObs) assert(value == 0.0f);
  diep_destroy(sim);

  sim = diep_create(&config);
  assert(sim != nullptr);
  diep_reset(sim, 456);
  needed = diep_snapshot_json(sim, nullptr, 0);
  assert(needed > 1);
  std::fill(episodeStats.begin(), episodeStats.end(), -1.0);
  assert(diep_episode_stats(sim, episodeStats.data(), statsNeeded) == statsNeeded);
  assert(episodeStats[ShotsFiredIndex] == 0.0);
  assert(episodeStats[LifetimeStepsIndex] == 0.0);
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
  combatSelf.assign(static_cast<std::size_t>(diep_combat_self_fields()), -1.0f);
  assert(diep_combat_self_observation(sim, 0, combatSelf.data(), diep_combat_self_fields()) == diep_combat_self_fields());
  assert(combatSelf[1] == 1.0f);
  assert(combatSelf[2] == 1.0f);
  assert(combatSelf[3] == 1.0f);
  assert(combatSelf[9] == 0.0f);
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
  std::vector<double> upgradeStats(static_cast<std::size_t>(EpisodeStatsFieldCount), -1.0);
  assert(diep_episode_stats(sim, upgradeStats.data(), EpisodeStatsFieldCount) == EpisodeStatsFieldCount);
  assert(upgradeStats[LevelReachedIndex] == 45.0);
  assert(upgradeStats[TankClassIndex] == 1.0);
  assert(upgradeStats[UpgradeChoicesIndex] > 0.0);
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
