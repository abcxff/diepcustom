import ray
from ray.rllib.algorithms.ppo import PPOConfig
from ray import tune
from pprint import pprint
from ray.rllib.examples.envs.classes.multi_agent import MultiAgentPendulum
from ray.tune import register_env

ray.init()

register_env("multi-pendulum", lambda cfg: MultiAgentPendulum({"num_agents": 2}))

# Configure and build an initial algorithm.
multi_agent_config = (
    PPOConfig()
    .environment("multi-pendulum")
    .multi_agent(
        policies={"p0", "p1"},
        # Agent IDs are 0 and 1 -> map to p0 and p1, respectively.
        policy_mapping_fn=lambda aid, eps, **kw: f"p{aid}"
    )
    .resources(
        num_gpus=-1,                   # Total GPUs to allocate to the main Learner process
        num_gpus_per_worker=0,        # Leave 0 if envs run on CPU (recommended for most environments)
        num_cpus_per_worker=2         # CPU count for each rollout worker
    )
)
ppo = multi_agent_config.build()

# Train for one iteration, then save to a checkpoint.
print(ppo.train())
multi_agent_checkpoint_dir = ppo.save_to_path()
print(f"saved multi-agent algo to {multi_agent_checkpoint_dir}")