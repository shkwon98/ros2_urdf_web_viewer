from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    rosbridge_port = LaunchConfiguration("rosbridge_port")
    web_host = LaunchConfiguration("web_host")
    web_port = LaunchConfiguration("web_port")

    return LaunchDescription(
        [
            DeclareLaunchArgument(
                "rosbridge_port",
                default_value="9090",
                description="rosbridge websocket port.",
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
            ),
            Node(
                package="rosapi",
                executable="rosapi_node",
                output="screen",
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
                    "--rosbridge-port",
                    rosbridge_port,
                ],
            ),
        ]
    )
