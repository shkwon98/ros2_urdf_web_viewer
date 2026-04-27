from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from robot_web_assembly.run_server import (
    build_viewer_config,
    cache_control_for_request_path,
    safe_resource_path,
)


class TestRunServerHelpers(unittest.TestCase):
    def test_safe_resource_path_rejects_directory_traversal(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "share" / "example_robot_description"
            root.mkdir(parents=True)

            with self.assertRaisesRegex(ValueError, "outside package"):
                safe_resource_path(root, "../secrets.txt")

    def test_safe_resource_path_accepts_nested_files(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "share" / "example_robot_description"
            mesh = root / "meshes" / "link.stl"
            mesh.parent.mkdir(parents=True)
            mesh.write_text("solid link\nendsolid link\n", encoding="utf-8")

            self.assertEqual(safe_resource_path(root, "meshes/link.stl"), mesh)

    def test_safe_resource_path_accepts_symlink_install_resources(self):
        with TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "install" / "share" / "example_robot_description"
            source = Path(temp_dir) / "src" / "example_robot_description"
            root_mesh_dir = root / "meshes"
            source_mesh = source / "meshes" / "link_mesh.STL"
            root_mesh_dir.mkdir(parents=True)
            source_mesh.parent.mkdir(parents=True)
            source_mesh.write_text("solid link\nendsolid link\n", encoding="utf-8")
            installed_mesh = root_mesh_dir / "link_mesh.STL"
            installed_mesh.symlink_to(source_mesh)

            self.assertEqual(
                safe_resource_path(root, "meshes/link_mesh.STL"),
                installed_mesh,
            )

    def test_build_viewer_config_omits_empty_optional_values(self):
        config = build_viewer_config(
            rosbridge_port="",
        )

        self.assertEqual(config, {})

    def test_build_viewer_config_exposes_rosbridge_port_only(self):
        config = build_viewer_config(
            rosbridge_port="9090",
        )

        self.assertEqual(config, {"rosbridgePort": 9090})
        self.assertNotIn("rosbridgeUrl", config)
        self.assertNotIn("assetBaseUrl", config)
        self.assertNotIn("fixedFrame", config)

    def test_web_assets_are_not_cached_but_package_assets_can_be_cached(self):
        self.assertEqual(cache_control_for_request_path("/app.js", 3600), "no-store")
        self.assertEqual(
            cache_control_for_request_path(
                "/packages/example_robot_description/meshes/link.stl",
                3600,
            ),
            "public, max-age=3600",
        )
