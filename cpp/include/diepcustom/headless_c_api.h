#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct diep_sim diep_sim;

typedef struct {
  uint64_t seed;
  int agents;
  int max_ticks;
  const char* scenario;
} diep_config;

typedef struct {
  int agent_id;
  double move_x;
  double move_y;
  double aim_x;
  double aim_y;
  int fire;
  int alt_fire;
  int stat_upgrade_choice;
  int tank_upgrade_choice;
} diep_action;

typedef struct {
  int tick;
  int done;
  int reward_count;
  const double* rewards;
} diep_step_result;

typedef struct {
  int rows;
  int cols;
  int channels;
  int layout;
} diep_observation_shape;

typedef struct {
  int fields;
  int layout;
  int continuous_start;
  int continuous_count;
  int discrete_start;
  int discrete_count;
} diep_action_shape;

enum {
  DIEP_OK = 0,
  DIEP_ERROR_NULL = -1,
  DIEP_ERROR_INVALID_ARGUMENT = -2,
  DIEP_ERROR_EXCEPTION = -3,
  DIEP_ERROR_INVALID_AGENT = -4,
  DIEP_LAYOUT_CHANNEL_LAST = 1,
  DIEP_ACTION_LAYOUT_V1_STRUCT = 1
};

int diep_abi_version(void);
int diep_last_error(diep_sim* sim);
diep_observation_shape diep_get_observation_shape(void);
diep_action_shape diep_get_action_shape(void);
int diep_agent_ids(diep_sim* sim, int* buffer, int buffer_len);
int diep_alive_mask(diep_sim* sim, int* buffer, int buffer_len);

diep_sim* diep_create(const diep_config* config);
void diep_destroy(diep_sim* sim);
void diep_reset(diep_sim* sim, uint64_t seed);
diep_step_result diep_step(diep_sim* sim, const diep_action* actions, int action_count);
diep_step_result diep_step_many(diep_sim* sim, const diep_action* actions, int action_count, int ticks);
int diep_snapshot_json(diep_sim* sim, char* buffer, int buffer_len);
int diep_observation(diep_sim* sim, int agent_id, float* buffer, int buffer_len);
int diep_observations(diep_sim* sim, float* buffer, int buffer_len);
int diep_agent_state_fields(void);
int diep_agent_states(diep_sim* sim, float* buffer, int buffer_len);
int diep_agent_progression_fields(void);
int diep_agent_progressions(diep_sim* sim, float* buffer, int buffer_len);

#ifdef __cplusplus
}
#endif
