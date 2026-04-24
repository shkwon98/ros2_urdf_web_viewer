from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    rosbridge_port = LaunchConfiguration("rosbridge_port")
    rosbridge_url = LaunchConfiguration("rosbridge_url")
    web_host = LaunchConfiguration("web_host")
    web_port = LaunchConfiguration("web_port")
    asset_base_url = LaunchConfiguration("asset_base_url")
    fixed_frame = LaunchConfiguration("fixed_frame")
    start_rosbridge = LaunchConfiguration("start_rosbridge")
    start_rosapi = LaunchConfiguration("start_rosapi")

    return LaunchDescription(
        [
            DeclareLaunchArgument(
                "fixed_frame",
                default_value="base_link",
                description="Reference frame name displayed in the browser UI.",
            ),
            DeclareLaunchArgument(
                "rosbridge_port",
                default_value="9090",
                description="rosbridge websocket port.",
            ),
            DeclareLaunchArgument(
                "rosbridge_url",
                default_value="",
                description="Explicit browser websocket URL. Empty means auto-detect host.",
            ),
            DeclareLaunchArgument(
                "web_host",
                default_value="0.0.0.0",
                description="HTTP host for the viewer and package asset server.",
            ),
            DeclareLaunchArgument(
                "web_port",
                default_value="8080",
                description="HTTP port for the viewer and package asset server.",
            ),
            DeclareLaunchArgument(
                "asset_base_url",
                default_value="",
                description="Explicit base URL for package assets. Empty means viewer origin.",
            ),
            DeclareLaunchArgument(
                "start_rosbridge",
                default_value="true",
                description="Start rosbridge_websocket from this launch file.",
            ),
            DeclareLaunchArgument(
                "start_rosapi",
                default_value="true",
                description="Start rosapi_node for browser topic discovery.",
            ),
            IncludeLaunchDescription(
                AnyLaunchDescriptionSource(
                    PathJoinSubstitution(
                        [
                            FindPackageShare("rosbridge_server"),
                            "launch",
                            "rosbridge_websocket_launch.xml",
                        ]
                    )
                ),
                launch_arguments={"port": rosbridge_port}.items(),
                condition=IfCondition(start_rosbridge),
            ),
            Node(
                package="rosapi",
                executable="rosapi_node",
                output="screen",
                condition=IfCondition(start_rosapi),
            ),
            Node(
                package="ros2_urdf_web_viewer",
                executable="ros2_urdf_web_viewer_server",
                output="screen",
                arguments=[
                    "--host",
                    web_host,
                    "--port",
                    web_port,
                    "--rosbridge-url",
                    rosbridge_url,
                    "--rosbridge-port",
                    rosbridge_port,
                    "--asset-base-url",
                    asset_base_url,
                    "--fixed-frame",
                    fixed_frame,
                ],
            ),
        ]
    )
