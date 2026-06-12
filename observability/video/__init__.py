"""Eval-only overlays and FFmpeg-backed video writing."""

from observability.video.render_grid_obs import render_grid_composite
from observability.video.render_overlay import overlay_frame
from observability.video.video_writer import FfmpegVideoWriter, VideoWriterStats

__all__ = ['FfmpegVideoWriter', 'VideoWriterStats', 'overlay_frame', 'render_grid_composite']
