#pragma once

#include <string>

namespace diepcustom::entity_core {

// Phase C parity entry point for the headless RL world snapshot. The current
// implementation is a deterministic report emitter used to wire C++ parity
// checks before the full entity manager/field model is ported behind it.
std::string entityCoreReportJson();

} // namespace diepcustom::entity_core
