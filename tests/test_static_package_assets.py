import json
from pathlib import Path
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]


class TestStaticPackageAssets(unittest.TestCase):
    def test_web_entrypoint_loads_required_browser_libraries(self):
        index_html = (PACKAGE_ROOT / "web" / "index.html").read_text(
            encoding="utf-8"
        )

        self.assertIn("ROS 2 URDF Web Viewer", index_html)
        self.assertIn("roslib.min.js", index_html)
        self.assertIn("urdf-loader", index_html)
        self.assertIn("three", index_html)
        self.assertIn("viewer-config.js", index_html)
        self.assertIn("ROS 2 Connection", index_html)
        self.assertIn('id="rosbridge-url"', index_html)
        self.assertIn('placeholder="ws://localhost:9090"', index_html)
        self.assertIn('id="assembly-preset"', index_html)
        self.assertIn('id="part-list"', index_html)
        self.assertIn('id="mount-list"', index_html)
        self.assertIn('id="rail-resizer"', index_html)
        self.assertIn('role="separator"', index_html)
        self.assertIn('aria-orientation="vertical"', index_html)
        self.assertNotIn("attachment", index_html.lower())
        self.assertIn('id="config-json"', index_html)
        self.assertNotIn('id="fixed-frame-label"', index_html)
        self.assertNotIn("Frame:", index_html)
        self.assertNotIn('id="refresh-topics-button"', index_html)
        self.assertNotIn("Refresh topics", index_html)
        self.assertNotIn('id="robot-description-topic" type="text"', index_html)
        self.assertNotIn('id="joint-states-topic" type="text"', index_html)

    def test_topic_discovery_refreshes_automatically(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("rosbridgeEndpoint", app_js)
        self.assertIn("TOPIC_REFRESH_INTERVAL_MS", app_js)
        self.assertIn("startTopicDiscovery", app_js)
        self.assertIn("stopTopicDiscovery", app_js)
        self.assertIn("setInterval", app_js)
        self.assertIn("rosbridgeUrl", app_js)
        self.assertIn("rosbridgeEndpoint()", app_js)
        self.assertIn("elements.rosbridgeUrl.value.trim()", app_js)
        self.assertNotIn("assetBaseUrl", app_js)
        self.assertNotIn("fixedFrame", app_js)
        self.assertNotIn("fixedFrameLabel", app_js)
        self.assertNotIn("refreshTopicsButton", app_js)

    def test_web_app_supports_browser_side_multi_urdf_assembly(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        preset_json = (
            PACKAGE_ROOT / "web" / "config" / "assembly-presets.json"
        ).read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")
        presets = json.loads(preset_json)
        index_html = (PACKAGE_ROOT / "web" / "index.html").read_text(
            encoding="utf-8"
        )

        self.assertIn("single_robot", presets)
        self.assertIn("rby1_wuji_hands", presets)
        rby1_wuji = presets["rby1_wuji_hands"]
        body_part = rby1_wuji["parts"][0]
        self.assertNotIn("modelType", preset_json)
        self.assertNotIn("modelType", app_js)
        self.assertNotIn("parentPartId", preset_json)
        self.assertNotIn("childLink", preset_json)
        self.assertNotIn("defaultOrigin", preset_json)
        self.assertNotIn("userOffset", preset_json)
        self.assertNotIn("attachments", preset_json)
        self.assertNotIn("attachment", app_js.lower())
        self.assertNotIn("attachment", index_html.lower())
        self.assertNotIn("attachment", styles_css.lower())
        self.assertNotIn("attachment", readme.lower())
        self.assertNotIn("attachments", rby1_wuji)
        self.assertEqual(body_part["id"], "body")
        self.assertEqual(body_part["robotName"], "rby1")
        self.assertEqual(rby1_wuji["parts"][1]["robotName"], "wuji_hand")
        self.assertEqual(rby1_wuji["parts"][2]["robotName"], "wuji_hand")
        self.assertEqual(rby1_wuji["parts"][1]["mountLink"], "left_palm_link")
        self.assertEqual(rby1_wuji["parts"][2]["mountLink"], "right_palm_link")
        self.assertIn("mounts", body_part)
        self.assertEqual(body_part["mounts"][0]["childPartId"], "left_hand")
        self.assertEqual(body_part["mounts"][1]["childPartId"], "right_hand")
        self.assertIn("origin", body_part["mounts"][0])
        self.assertIn("assembly-presets.json", app_js)
        self.assertIn("assemblyPresets", app_js)
        self.assertNotIn("rby1_wuji_hands", app_js)
        self.assertNotIn("/control/hand_left/robot_description", app_js)
        self.assertIn("rby1_wuji_hands", preset_json)
        self.assertIn("/control/body/robot_description", preset_json)
        self.assertIn("/control/hand_left/robot_description", preset_json)
        self.assertIn("/control/hand_right/robot_description", preset_json)
        self.assertIn("/sensors/proprio/body/joint_states", preset_json)
        self.assertIn("/sensors/proprio/hand_left/joint_states", preset_json)
        self.assertIn("/sensors/proprio/hand_right/joint_states", preset_json)
        self.assertIn("ee_left", preset_json)
        self.assertIn("ee_right", preset_json)
        self.assertIn("left_palm_link", preset_json)
        self.assertIn("right_palm_link", preset_json)
        self.assertIn("hiddenLinks", preset_json)
        self.assertIn('"ee_left"', preset_json)
        self.assertIn('"ee_right"', preset_json)
        self.assertIn("3.141592653589793", preset_json)
        self.assertIn("-0.7853981633974483", preset_json)
        self.assertIn("0.7853981633974483", preset_json)
        self.assertIn("robotName", app_js)
        self.assertIn("robotNameMatches", app_js)
        self.assertIn("robot name mismatch", app_js)
        self.assertIn("applyHiddenLinks", app_js)
        self.assertIn("selectTopicForPart", app_js)
        self.assertIn("topicCandidates", app_js)
        self.assertIn("mountLink", app_js)
        self.assertIn("updateMountTransforms", app_js)
        self.assertIn("rootToChildLink", app_js)
        self.assertIn("mount.origin", app_js)
        self.assertIn("assemblyConfigSnapshot", app_js)
        self.assertNotIn("exportAssemblyConfig", app_js)
        self.assertNotIn("importAssemblyConfig", app_js)
        self.assertNotIn("localStorage", app_js)
        self.assertIn("Assembly Preset", index_html)
        self.assertIn("Mounts", index_html)
        self.assertIn("Configuration", index_html)

    def test_configuration_action_buttons_are_removed(self):
        index_html = (PACKAGE_ROOT / "web" / "index.html").read_text(
            encoding="utf-8"
        )
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn('id="config-json"', index_html)
        self.assertNotIn('id="save-config-button"', index_html)
        self.assertNotIn('id="load-config-button"', index_html)
        self.assertNotIn('id="export-config-button"', index_html)
        self.assertNotIn('id="import-config-button"', index_html)
        self.assertNotIn("<span>Save</span>", index_html)
        self.assertNotIn("<span>Load</span>", index_html)
        self.assertNotIn("<span>Export</span>", index_html)
        self.assertNotIn("<span>Import</span>", index_html)
        self.assertNotIn("saveConfigButton", app_js)
        self.assertNotIn("loadConfigButton", app_js)
        self.assertNotIn("exportConfigButton", app_js)
        self.assertNotIn("importConfigButton", app_js)
        self.assertNotIn("saveAssemblyConfig", app_js)
        self.assertNotIn("loadSavedAssemblyConfig", app_js)
        self.assertNotIn("importAssemblyConfig", app_js)
        self.assertNotIn(".button-grid", styles_css)
        self.assertNotIn("exported", readme.lower())
        self.assertNotIn("imported", readme.lower())
        self.assertNotIn("local storage", readme.lower())

    def test_control_rail_can_be_resized_by_dragging(self):
        index_html = (PACKAGE_ROOT / "web" / "index.html").read_text(
            encoding="utf-8"
        )
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )

        self.assertIn('id="rail-resizer"', index_html)
        self.assertIn('class="rail-resizer"', index_html)
        self.assertIn("--rail-width", styles_css)
        self.assertIn(".rail-resizer", styles_css)
        self.assertIn("cursor: col-resize", styles_css)
        self.assertIn("touch-action: none", styles_css)
        self.assertIn("resizing-rail", styles_css)
        self.assertIn("railResizer", app_js)
        self.assertIn("setupRailResizer", app_js)
        self.assertIn("clampRailWidth", app_js)
        self.assertIn("setRailWidth", app_js)
        self.assertIn('addEventListener("pointerdown"', app_js)
        self.assertIn("setPointerCapture", app_js)
        self.assertIn("resizeRenderer()", app_js)

    def test_robot_description_can_fallback_to_rosapi_parameter_lookup(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("scheduleRobotDescriptionFallback", app_js)
        self.assertIn("loadRobotDescriptionFromRosapiParams", app_js)
        self.assertIn('name: "/rosapi/publishers"', app_js)
        self.assertIn('serviceType: "rosapi_msgs/Publishers"', app_js)
        self.assertIn('name: "/rosapi/get_param"', app_js)
        self.assertIn('serviceType: "rosapi_msgs/GetParam"', app_js)
        self.assertIn('`${publisher}:robot_description`', app_js)
        self.assertIn("JSON.parse(response.value)", app_js)
        self.assertIn("loadRobotDescriptionFromRosapiParams(part);", app_js)
        self.assertIn('"no param publishers"', app_js)
        self.assertIn('"param unavailable"', app_js)

    def test_status_updates_are_safe_during_async_rerenders(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("if (!element) {", app_js)
        self.assertIn("return;", app_js)
        self.assertIn("function updatePartStatuses()", app_js)

    def test_topic_empty_placeholders_only_render_when_no_topics_exist(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")

        self.assertIn("if (topics.length === 0)", app_js)
        self.assertIn("placeholderOption.textContent = placeholder", app_js)
        self.assertIn("return;", app_js)

    def test_part_cards_do_not_render_per_part_debug_status_blocks(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )

        self.assertNotIn('createElement("dl", "part-status")', app_js)
        self.assertNotIn('createElement("dd", "part-urdf-status"', app_js)
        self.assertNotIn('createElement("dd", "part-joint-status"', app_js)
        self.assertNotIn(".part-urdf-status", app_js)
        self.assertNotIn(".part-joint-status", app_js)
        self.assertNotIn(".part-status", styles_css)

    def test_mount_offsets_have_number_inputs_sliders_and_empty_value_normalization(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )

        self.assertIn('slider.type = "range"', app_js)
        self.assertIn("syncOffsetControls", app_js)
        self.assertIn("normalizeOffsetInput", app_js)
        self.assertIn('input.addEventListener("blur"', app_js)
        self.assertIn('input.value.trim() === ""', app_js)
        self.assertIn(".mount-grid label", styles_css)
        self.assertIn("min-width: 0;", styles_css)
        self.assertIn(".offset-slider", styles_css)
        self.assertIn("width: 100%;", styles_css)
        self.assertIn("max-width: 100%;", styles_css)

    def test_mount_relationship_fields_are_read_only(self):
        app_js = (PACKAGE_ROOT / "web" / "app.js").read_text(encoding="utf-8")
        styles_css = (PACKAGE_ROOT / "web" / "styles.css").read_text(
            encoding="utf-8"
        )

        self.assertIn("createReadonlyField", app_js)
        self.assertIn('createReadonlyField("Parent"', app_js)
        self.assertIn('createReadonlyField("Child"', app_js)
        self.assertNotIn('createLabel("Parent part"', app_js)
        self.assertNotIn('createLabel("Child part"', app_js)
        self.assertNotIn('createLabel("Parent link"', app_js)
        self.assertNotIn("mount-part-select", app_js)
        self.assertNotIn("mount-link-select", app_js)
        self.assertIn(".readonly-field", styles_css)
        self.assertIn(".readonly-value", styles_css)

    def test_launch_file_starts_rosbridge_and_rosapi_unconditionally(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("start_rosapi", launch_file)
        self.assertNotIn("start_rosbridge", launch_file)
        self.assertNotIn("IfCondition", launch_file)
        self.assertNotIn("IncludeLaunchDescription", launch_file)
        self.assertNotIn("rosbridge_websocket_launch.xml", launch_file)
        self.assertNotIn("FindPackageShare", launch_file)
        self.assertIn('package="rosbridge_server"', launch_file)
        self.assertIn('executable="rosbridge_websocket"', launch_file)
        self.assertIn("ParameterValue(rosbridge_port, value_type=int)", launch_file)
        self.assertIn('package="rosapi"', launch_file)
        self.assertIn('executable="rosapi_node"', launch_file)
        self.assertNotIn("rosbridge_url", launch_file)
        self.assertNotIn("--rosbridge-url", launch_file)
        self.assertNotIn("asset_base_url", launch_file)
        self.assertNotIn("--asset-base-url", launch_file)
        self.assertNotIn("fixed_frame", launch_file)
        self.assertNotIn("--fixed-frame", launch_file)
        self.assertNotIn("robot_description_topic", launch_file)
        self.assertNotIn("joint_states_topic", launch_file)
        self.assertIn("rosbridge_port", launch_file)
        self.assertIn("ros2_urdf_web_viewer_server", launch_file)

    def test_launch_arguments_are_documented_web_host_web_port_rosbridge_port(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        launch_config_order = [
            launch_file.index('LaunchConfiguration("web_host")'),
            launch_file.index('LaunchConfiguration("web_port")'),
            launch_file.index('LaunchConfiguration("rosbridge_port")'),
        ]
        self.assertEqual(launch_config_order, sorted(launch_config_order))

        launch_argument_order = [
            launch_file.index('                "web_host",'),
            launch_file.index('                "web_port",'),
            launch_file.index('                "rosbridge_port",'),
        ]
        self.assertEqual(launch_argument_order, sorted(launch_argument_order))

        readme_order = [
            readme.index("`web_host`"),
            readme.index("`web_port`"),
            readme.index("`rosbridge_port`"),
        ]
        self.assertEqual(readme_order, sorted(readme_order))

    def test_readme_is_generic_for_open_source_use(self):
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("## Features", readme)
        self.assertIn("## Requirements", readme)
        self.assertIn("## Topic Expectations", readme)
        self.assertIn("## Browser-Side Assembly", readme)
        self.assertIn("## Launch Arguments", readme)
        self.assertIn("## Troubleshooting", readme)
        self.assertIn("## Development", readme)
        self.assertNotIn("RBY1", readme)
        self.assertNotIn("rby1", readme)
        self.assertNotIn("wuji", readme)
        self.assertNotIn("quest3", readme)
        self.assertNotIn("dex_graft", readme)
        self.assertNotIn("/home/", readme)
        self.assertNotIn("this workspace", readme)

    def test_readme_demo_gifs_reference_existing_docs_assets(self):
        readme = (PACKAGE_ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("docs/desktop-demo.gif", readme)
        self.assertIn("docs/mobile-demo.gif", readme)
        self.assertTrue((PACKAGE_ROOT / "docs" / "desktop-demo.gif").is_file())
        self.assertTrue((PACKAGE_ROOT / "docs" / "mobile-demo.gif").is_file())

    def test_viewer_launch_does_not_publish_robot_description(self):
        launch_file = (PACKAGE_ROOT / "launch" / "viewer.launch.py").read_text(
            encoding="utf-8"
        )
        package_xml = (PACKAGE_ROOT / "package.xml").read_text(encoding="utf-8")

        self.assertNotIn("robot_state_publisher", launch_file)
        self.assertNotIn("joint_state_publisher_gui", launch_file)
        self.assertNotIn("xacro_file", launch_file)
        self.assertIn("<name>ros2_urdf_web_viewer</name>", package_xml)
        self.assertIn("<exec_depend>rosapi</exec_depend>", package_xml)
        self.assertNotIn("ros2_urdf_web_viewer_example", package_xml)
        self.assertNotIn("<exec_depend>robot_state_publisher</exec_depend>", package_xml)
        self.assertNotIn("<exec_depend>xacro</exec_depend>", package_xml)

    def test_console_entrypoint_uses_run_server_module(self):
        setup_py = (PACKAGE_ROOT / "setup.py").read_text(encoding="utf-8")

        self.assertIn("ros2_urdf_web_viewer.run_server:main", setup_py)
        self.assertNotIn("ros2_urdf_web_viewer.asset_server:main", setup_py)
