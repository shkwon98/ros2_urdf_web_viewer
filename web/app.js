import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";

const config = window.ROS_URDF_VIEWER_CONFIG || {};

const elements = {
  canvas: document.querySelector("#viewer-canvas"),
  rosbridgeUrl: document.querySelector("#rosbridge-url"),
  robotDescriptionTopic: document.querySelector("#robot-description-topic"),
  jointStatesTopic: document.querySelector("#joint-states-topic"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  refreshTopicsButton: document.querySelector("#refresh-topics-button"),
  reloadButton: document.querySelector("#reload-button"),
  fitButton: document.querySelector("#fit-button"),
  resetViewButton: document.querySelector("#reset-view-button"),
  collisionToggle: document.querySelector("#collision-toggle"),
  gridToggle: document.querySelector("#grid-toggle"),
  rosStatus: document.querySelector("#ros-status"),
  urdfStatus: document.querySelector("#urdf-status"),
  jointStatus: document.querySelector("#joint-status"),
  fixedFrameLabel: document.querySelector("#fixed-frame-label"),
};

const state = {
  ros: null,
  descriptionTopic: null,
  jointTopic: null,
  robot: null,
  latestUrdfXml: "",
  jointUpdates: 0,
  pendingJointValues: null,
  discoveredTopics: [],
};

const DESCRIPTION_TYPES = new Set(["std_msgs/String", "std_msgs/msg/String"]);
const JOINT_STATE_TYPES = new Set([
  "sensor_msgs/JointState",
  "sensor_msgs/msg/JointState",
]);

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d1b18);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 200);
camera.up.set(0, 0, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0.65);

const hemiLight = new THREE.HemisphereLight(0xfff4dd, 0x2f4d58, 2.8);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
keyLight.position.set(3.4, -4.2, 5.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffd39a, 1.2);
fillLight.position.set(-3.8, 2.5, 3.2);
scene.add(fillLight);

const grid = new THREE.GridHelper(8, 32, 0x69807b, 0x343a37);
grid.rotation.x = Math.PI / 2;
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

const axes = new THREE.AxesHelper(0.6);
scene.add(axes);

function defaultRosbridgeUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = config.rosbridgePort || 9090;
  return `${protocol}//${window.location.hostname}:${port}`;
}

function resetInputs() {
  elements.rosbridgeUrl.value = config.rosbridgeUrl || defaultRosbridgeUrl();
  elements.fixedFrameLabel.textContent = `Frame: ${config.fixedFrame || "base"}`;
}

function setStatus(element, text, className = "") {
  element.textContent = text;
  element.className = className;
}

function setConnectedUi(connected) {
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  elements.refreshTopicsButton.disabled = !connected;
  elements.robotDescriptionTopic.disabled = !connected;
  elements.jointStatesTopic.disabled = !connected;
}

function normalizeTopicType(type) {
  return type.replace("/msg/", "/");
}

function setSelectOptions(select, topics, placeholder) {
  const previousValue = select.value;
  select.replaceChildren();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  topics.forEach(({ name, type }) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${normalizeTopicType(type)})`;
    select.appendChild(option);
  });

  const preferred = topics.find((topic) => topic.name === previousValue) || topics[0];
  if (preferred) {
    select.value = preferred.name;
  }
}

function topicPairs(response) {
  const topics = response.topics || [];
  const types = response.types || [];
  return topics
    .map((name, index) => ({ name, type: types[index] || "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function chooseDescriptionTopics(topics) {
  return topics.filter(
    (topic) =>
      DESCRIPTION_TYPES.has(topic.type) && topic.name.includes("robot_description"),
  );
}

function chooseJointStateTopics(topics) {
  return topics.filter((topic) => JOINT_STATE_TYPES.has(topic.type));
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = renderer.domElement;
  if (
    renderer.domElement.width !== Math.floor(clientWidth * renderer.getPixelRatio()) ||
    renderer.domElement.height !== Math.floor(clientHeight * renderer.getPixelRatio())
  ) {
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(1, clientHeight);
    camera.updateProjectionMatrix();
  }
}

function resetView() {
  camera.position.set(3.4, -4.6, 2.3);
  controls.target.set(0, 0, 0.75);
  controls.update();
}

function fitRobot() {
  if (!state.robot) {
    resetView();
    return;
  }

  const box = new THREE.Box3().setFromObject(state.robot);
  if (box.isEmpty()) {
    resetView();
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxSize = Math.max(size.x, size.y, size.z, 0.5);
  const distance = maxSize / (2 * Math.tan((camera.fov * Math.PI) / 360));
  const direction = new THREE.Vector3(1.2, -1.6, 0.85).normalize();

  controls.target.copy(center);
  camera.position.copy(center).add(direction.multiplyScalar(distance * 1.8));
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(50, distance * 100);
  camera.updateProjectionMatrix();
  controls.update();
}

function packageBaseUrl(packageName) {
  const assetBaseUrl = (config.assetBaseUrl || window.location.origin).replace(/\/$/, "");
  return `${assetBaseUrl}/packages/${encodeURIComponent(packageName)}`;
}

function clearRobot() {
  if (!state.robot) {
    return;
  }

  scene.remove(state.robot);
  state.robot.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
    if (object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
  state.robot = null;
}

function applyPendingJointValues() {
  if (state.robot && state.pendingJointValues) {
    state.robot.setJointValues(state.pendingJointValues);
    state.pendingJointValues = null;
  }
}

function loadUrdfXml(urdfXml) {
  if (!urdfXml || urdfXml === state.latestUrdfXml) {
    return;
  }

  state.latestUrdfXml = urdfXml;
  clearRobot();
  setStatus(elements.urdfStatus, "loading", "warn");

  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);
  loader.packages = packageBaseUrl;
  loader.parseVisual = true;
  loader.parseCollision = elements.collisionToggle.checked;

  manager.onLoad = () => {
    fitRobot();
    setStatus(elements.urdfStatus, `${Object.keys(state.robot?.links || {}).length} links`, "online");
  };
  manager.onError = (url) => {
    console.error(`Mesh load failed: ${url}`);
    setStatus(elements.urdfStatus, "mesh error", "error");
  };

  try {
    const robot = loader.parse(urdfXml);
    robot.name = "ROS2_URDF_Robot";
    scene.add(robot);
    state.robot = robot;
    applyPendingJointValues();
    fitRobot();
  } catch (error) {
    console.error(error);
    setStatus(elements.urdfStatus, "parse error", "error");
  }
}

function refreshTopics() {
  if (!state.ros) {
    return;
  }

  setStatus(elements.urdfStatus, "discovering", "warn");
  const topicsService = new ROSLIB.Service({
    ros: state.ros,
    name: "/rosapi/topics",
    serviceType: "rosapi_msgs/Topics",
  });

  topicsService.callService(
    new ROSLIB.ServiceRequest({}),
    (response) => {
      state.discoveredTopics = topicPairs(response);
      const descriptionTopics = chooseDescriptionTopics(state.discoveredTopics);
      const jointStateTopics = chooseJointStateTopics(state.discoveredTopics);

      setSelectOptions(
        elements.robotDescriptionTopic,
        descriptionTopics,
        "No robot_description topics found",
      );
      setSelectOptions(
        elements.jointStatesTopic,
        jointStateTopics,
        "No joint state topics found",
      );

      if (descriptionTopics.length === 0) {
        setStatus(elements.urdfStatus, "no description topic", "error");
      } else {
        setStatus(elements.urdfStatus, "topic selected", "warn");
      }
      setStatus(
        elements.jointStatus,
        jointStateTopics.length === 0 ? "no joint topics" : "topic selected",
        jointStateTopics.length === 0 ? "error" : "warn",
      );

      subscribeTopics();
    },
    (error) => {
      console.error(error);
      setStatus(elements.urdfStatus, "rosapi error", "error");
      setStatus(elements.jointStatus, "rosapi error", "error");
    },
  );
}

function handleJointState(message) {
  const values = {};
  const names = message.name || [];
  const positions = message.position || [];

  names.forEach((name, index) => {
    const value = positions[index];
    if (Number.isFinite(value)) {
      values[name] = value;
    }
  });

  state.jointUpdates += 1;
  setStatus(elements.jointStatus, `${state.jointUpdates} updates`, "online");

  if (state.robot) {
    state.robot.setJointValues(values);
  } else {
    state.pendingJointValues = values;
  }
}

function unsubscribeTopics() {
  if (state.descriptionTopic) {
    state.descriptionTopic.unsubscribe();
    state.descriptionTopic = null;
  }
  if (state.jointTopic) {
    state.jointTopic.unsubscribe();
    state.jointTopic = null;
  }
}

function subscribeTopics() {
  unsubscribeTopics();
  const descriptionTopicName = elements.robotDescriptionTopic.value;
  const jointTopicName = elements.jointStatesTopic.value;

  if (!descriptionTopicName) {
    return;
  }

  state.descriptionTopic = new ROSLIB.Topic({
    ros: state.ros,
    name: descriptionTopicName,
    messageType: "std_msgs/String",
  });

  state.descriptionTopic.subscribe((message) => loadUrdfXml(message.data));

  if (jointTopicName) {
    state.jointTopic = new ROSLIB.Topic({
      ros: state.ros,
      name: jointTopicName,
      messageType: "sensor_msgs/JointState",
      throttle_rate: 33,
    });
    state.jointTopic.subscribe(handleJointState);
  }
}

function disconnectRos() {
  unsubscribeTopics();
  if (state.ros) {
    state.ros.close();
    state.ros = null;
  }
  setConnectedUi(false);
  setStatus(elements.rosStatus, "offline");
}

function connectRos() {
  disconnectRos();

  const url = elements.rosbridgeUrl.value.trim() || defaultRosbridgeUrl();
  const ros = new ROSLIB.Ros({ url });
  state.ros = ros;

  setStatus(elements.rosStatus, "connecting", "warn");
  setConnectedUi(true);

  ros.on("connection", () => {
    setStatus(elements.rosStatus, "online", "online");
    refreshTopics();
  });
  ros.on("close", () => {
    setStatus(elements.rosStatus, "offline");
    setConnectedUi(false);
  });
  ros.on("error", (error) => {
    console.error(error);
    setStatus(elements.rosStatus, "error", "error");
    setConnectedUi(false);
  });
}

function reloadRobot() {
  const urdfXml = state.latestUrdfXml;
  state.latestUrdfXml = "";
  loadUrdfXml(urdfXml);
}

function animate() {
  resizeRenderer();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

resetInputs();
resetView();
setConnectedUi(false);
setStatus(elements.rosStatus, "offline");
setStatus(elements.urdfStatus, "waiting");
setStatus(elements.jointStatus, "0 updates");
elements.gridToggle.addEventListener("change", () => {
  grid.visible = elements.gridToggle.checked;
});
elements.collisionToggle.addEventListener("change", reloadRobot);
elements.connectButton.addEventListener("click", connectRos);
elements.disconnectButton.addEventListener("click", disconnectRos);
elements.refreshTopicsButton.addEventListener("click", refreshTopics);
elements.robotDescriptionTopic.addEventListener("change", subscribeTopics);
elements.jointStatesTopic.addEventListener("change", subscribeTopics);
elements.reloadButton.addEventListener("click", reloadRobot);
elements.fitButton.addEventListener("click", fitRobot);
elements.resetViewButton.addEventListener("click", resetView);
window.addEventListener("resize", resizeRenderer);
window.lucide?.createIcons();

animate();
