import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader from "urdf-loader";

const config = window.ROS_URDF_VIEWER_CONFIG || {};

const elements = {
  appShell: document.querySelector(".app-shell"),
  controlRail: document.querySelector(".control-rail"),
  canvas: document.querySelector("#viewer-canvas"),
  rosbridgeUrl: document.querySelector("#rosbridge-url"),
  assemblyPreset: document.querySelector("#assembly-preset"),
  partList: document.querySelector("#part-list"),
  mountList: document.querySelector("#mount-list"),
  railResizer: document.querySelector("#rail-resizer"),
  configJson: document.querySelector("#config-json"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  reloadButton: document.querySelector("#reload-button"),
  fitButton: document.querySelector("#fit-button"),
  resetViewButton: document.querySelector("#reset-view-button"),
  collisionToggle: document.querySelector("#collision-toggle"),
  gridToggle: document.querySelector("#grid-toggle"),
  rosStatus: document.querySelector("#ros-status"),
  urdfStatus: document.querySelector("#urdf-status"),
  jointStatus: document.querySelector("#joint-status"),
};

const zeroOrigin = () => ({
  xyz: [0, 0, 0],
  rpy: [0, 0, 0],
});

const PRESET_CONFIG_URL = "config/assembly-presets.json";
const FALLBACK_PRESETS = {
  single_robot: {
    label: "Single robot",
    parts: [
      {
        id: "robot",
        robotName: "",
        descriptionTopic: "",
        jointStateTopic: "",
      },
    ],
  },
};
let assemblyPresets = {};

const DESCRIPTION_TYPES = new Set(["std_msgs/String", "std_msgs/msg/String"]);
const JOINT_STATE_TYPES = new Set([
  "sensor_msgs/JointState",
  "sensor_msgs/msg/JointState",
]);
const TOPIC_REFRESH_INTERVAL_MS = 3000;
const ROBOT_DESCRIPTION_FALLBACK_DELAY_MS = 900;
const RAIL_DEFAULT_WIDTH = 420;
const RAIL_MIN_WIDTH = 300;
const RAIL_MAX_WIDTH = 760;

const state = {
  ros: null,
  parts: new Map(),
  mounts: [],
  discoveredTopics: [],
  topicRefreshTimer: null,
  topicRefreshInFlight: false,
};

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

const assemblyRoot = new THREE.Group();
assemblyRoot.name = "ROS2_URDF_Assembly";
scene.add(assemblyRoot);

function cloneOrigin(origin = zeroOrigin()) {
  return {
    xyz: [...(origin.xyz || [0, 0, 0])],
    rpy: [...(origin.rpy || [0, 0, 0])],
  };
}

function cloneMountConfig(mount) {
  const origin = cloneOrigin(mount.origin);
  return {
    id: mount.id,
    parentPartId: mount.parentPartId,
    parentLink: mount.parentLink,
    childPartId: mount.childPartId,
    origin,
    initialOrigin: cloneOrigin(mount.initialOrigin || origin),
  };
}

function cloneNestedMountConfig(mount) {
  return {
    id: mount.id,
    parentLink: mount.parentLink,
    childPartId: mount.childPartId,
    origin: cloneOrigin(mount.origin),
  };
}

function cloneTopicCandidates(topicCandidates = {}) {
  return {
    descriptions: [...(topicCandidates.descriptions || [])],
    joints: [...(topicCandidates.joints || [])],
  };
}

function cloneStringArray(values = []) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string")
    : [];
}

function cloneAssemblyConfig(assemblyConfig) {
  const parts = (assemblyConfig.parts || []).map((part) => ({
    id: part.id,
    robotName: part.robotName || "",
    mountLink: part.mountLink || "",
    descriptionTopic: part.descriptionTopic || "",
    jointStateTopic: part.jointStateTopic || "",
    hiddenLinks: cloneStringArray(part.hiddenLinks),
    topicCandidates: cloneTopicCandidates(part.topicCandidates),
    mounts: (part.mounts || []).map(cloneNestedMountConfig),
  }));
  const nestedMounts = parts.flatMap((part) =>
    (part.mounts || []).map((mount) =>
      cloneMountConfig({ ...mount, parentPartId: part.id }),
    ),
  );
  return {
    parts,
    mounts: nestedMounts,
  };
}

function normalizeAssemblyPresets(rawPresets) {
  if (!rawPresets || typeof rawPresets !== "object" || Array.isArray(rawPresets)) {
    throw new Error("Preset config must be an object.");
  }

  const normalized = {};
  Object.entries(rawPresets).forEach(([id, preset]) => {
    if (!preset || !Array.isArray(preset.parts)) {
      return;
    }
    normalized[id] = {
      label: preset.label || id,
      ...cloneAssemblyConfig(preset),
    };
  });

  if (Object.keys(normalized).length === 0) {
    throw new Error("Preset config does not contain any valid presets.");
  }

  return normalized;
}

async function loadAssemblyPresets() {
  try {
    const response = await fetch(PRESET_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    assemblyPresets = normalizeAssemblyPresets(await response.json());
  } catch (error) {
    console.error(`Failed to load ${PRESET_CONFIG_URL}`, error);
    assemblyPresets = normalizeAssemblyPresets(FALLBACK_PRESETS);
  }
}

function rosbridgeEndpoint() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = config.rosbridgePort || 9090;
  return `${protocol}//${window.location.hostname}:${port}`;
}

function resetConnectionDefaults() {
  elements.rosbridgeUrl.value = rosbridgeEndpoint();
}

function setStatus(element, text, className = "") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.className = className;
}

function normalizeTopicType(type) {
  return type.replace("/msg/", "/");
}

function setSelectOptions(
  select,
  topics,
  placeholder,
  preferredValue = "",
  allowFallback = true,
) {
  select.replaceChildren();

  if (topics.length === 0) {
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
    select.appendChild(placeholderOption);
    return;
  }

  topics.forEach(({ name, type }) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${normalizeTopicType(type)})`;
    select.appendChild(option);
  });

  const preferred = topics.find((topic) => topic.name === preferredValue);
  if (!preferred && preferredValue && !allowFallback) {
    const missingOption = document.createElement("option");
    missingOption.value = preferredValue;
    missingOption.textContent = `${preferredValue} (not discovered)`;
    select.prepend(missingOption);
    select.value = preferredValue;
    return;
  }

  if (!preferred && !allowFallback) {
    return;
  }

  const fallback = preferred || topics[0];
  if (fallback) {
    select.value = fallback.name;
  }
}

function selectTopicForPart(topics, configuredTopic, currentTopic, topicCandidates = []) {
  const candidates = [
    configuredTopic,
    ...topicCandidates,
    currentTopic,
  ].filter(Boolean);
  const selected = candidates
    .map((candidate) => topics.find((topic) => topic.name === candidate))
    .find(Boolean);
  return selected?.name || configuredTopic || currentTopic || "";
}

function setConnectedUi(connected) {
  elements.connectButton.disabled = connected;
  elements.disconnectButton.disabled = !connected;
  elements.rosbridgeUrl.disabled = connected;
  elements.partList
    .querySelectorAll(".part-topic-select")
    .forEach((select) => {
      select.disabled = !connected;
    });
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

function currentRailWidth() {
  return elements.controlRail?.getBoundingClientRect().width || RAIL_DEFAULT_WIDTH;
}

function maxRailWidth() {
  return Math.max(
    RAIL_MIN_WIDTH,
    Math.min(RAIL_MAX_WIDTH, Math.floor(window.innerWidth * 0.62)),
  );
}

function clampRailWidth(width) {
  return Math.round(
    Math.min(Math.max(width, RAIL_MIN_WIDTH), maxRailWidth()),
  );
}

function setRailWidth(width) {
  const nextWidth = clampRailWidth(width);
  elements.appShell.style.setProperty("--rail-width", `${nextWidth}px`);
  elements.railResizer.setAttribute("aria-valuenow", `${nextWidth}`);
  elements.railResizer.setAttribute("aria-valuemin", `${RAIL_MIN_WIDTH}`);
  elements.railResizer.setAttribute("aria-valuemax", `${maxRailWidth()}`);
  resizeRenderer();
}

function railWidthFromPointer(event) {
  return event.clientX - elements.appShell.getBoundingClientRect().left;
}

function handleWindowResize() {
  setRailWidth(currentRailWidth());
}

function setupRailResizer() {
  if (!elements.appShell || !elements.controlRail || !elements.railResizer) {
    return;
  }

  setRailWidth(currentRailWidth());

  elements.railResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    document.body.classList.add("resizing-rail");
    elements.railResizer.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      setRailWidth(railWidthFromPointer(moveEvent));
    };
    const finishResize = () => {
      document.body.classList.remove("resizing-rail");
      elements.railResizer.removeEventListener("pointermove", handlePointerMove);
      elements.railResizer.removeEventListener("pointerup", finishResize);
      elements.railResizer.removeEventListener("pointercancel", finishResize);
    };

    elements.railResizer.addEventListener("pointermove", handlePointerMove);
    elements.railResizer.addEventListener("pointerup", finishResize);
    elements.railResizer.addEventListener("pointercancel", finishResize);
  });

  elements.railResizer.addEventListener("dblclick", () => {
    setRailWidth(RAIL_DEFAULT_WIDTH);
  });

  elements.railResizer.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setRailWidth(currentRailWidth() - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setRailWidth(currentRailWidth() + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setRailWidth(RAIL_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setRailWidth(maxRailWidth());
    }
  });
}

function resetView() {
  camera.position.set(3.4, -4.6, 2.3);
  controls.target.set(0, 0, 0.75);
  controls.update();
}

function fitRobot() {
  const box = new THREE.Box3().setFromObject(assemblyRoot);
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
  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/packages/${encodeURIComponent(packageName)}`;
}

function createPartRuntime(partConfig) {
  return {
    id: partConfig.id,
    robotName: partConfig.robotName || "",
    mountLink: partConfig.mountLink || "",
    descriptionTopicName: partConfig.descriptionTopic || "",
    jointStateTopicName: partConfig.jointStateTopic || "",
    topicCandidates: cloneTopicCandidates(partConfig.topicCandidates),
    hiddenLinks: cloneStringArray(partConfig.hiddenLinks),
    descriptionTopic: null,
    jointTopic: null,
    descriptionFallbackTimer: null,
    paramLookupInFlight: false,
    subscribedDescriptionTopicName: "",
    subscribedJointTopicName: "",
    robot: null,
    latestUrdfXml: "",
    pendingJointValues: null,
    jointUpdates: 0,
    urdfStatus: "waiting",
    jointStatus: "0 updates",
  };
}

function disposeRobot(robot) {
  robot.traverse((object) => {
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
}

function clearPartRobot(part) {
  if (!part.robot) {
    return;
  }

  assemblyRoot.remove(part.robot);
  disposeRobot(part.robot);
  part.robot = null;
  part.pendingJointValues = null;
  part.urdfStatus = "waiting";
}

function clearRobotDescriptionFallback(part) {
  if (part.descriptionFallbackTimer) {
    window.clearTimeout(part.descriptionFallbackTimer);
    part.descriptionFallbackTimer = null;
  }
}

function clearAllRobots() {
  state.parts.forEach(clearPartRobot);
}

function partControlRoot(partId) {
  return Array.from(elements.partList.querySelectorAll(".part-card")).find(
    (card) => card.dataset.partId === partId,
  );
}

function mountControlRoot(mountId) {
  return Array.from(elements.mountList.querySelectorAll(".mount-card")).find(
    (card) => card.dataset.mountId === mountId,
  );
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function createLabel(text, control) {
  const label = document.createElement("label");
  label.append(text, control);
  return label;
}

function createReadonlyField(text, value) {
  const field = createElement("div", "readonly-field");
  field.append(
    createElement("span", "", text),
    createElement("div", "readonly-value", value || "-"),
  );
  return field;
}

function renderPresetOptions() {
  elements.assemblyPreset.replaceChildren();
  Object.entries(assemblyPresets).forEach(([id, preset]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = preset.label;
    elements.assemblyPreset.appendChild(option);
  });
}

function renderPartControls() {
  elements.partList.replaceChildren();
  state.parts.forEach((part) => {
    const card = createElement("article", "part-card");
    card.dataset.partId = part.id;

    const header = createElement("div", "card-heading");
    const titleBlock = createElement("div");
    titleBlock.append(
      createElement("strong", "", part.id),
      createElement("span", "", part.robotName || "any robot"),
    );
    header.append(titleBlock);

    const descriptionSelect = createElement(
      "select",
      "part-topic-select part-description-topic",
    );
    descriptionSelect.disabled = !state.ros;
    descriptionSelect.addEventListener("change", () => {
      part.descriptionTopicName = descriptionSelect.value;
      subscribePartTopics(part);
      updateCurrentConfigText();
    });

    const jointSelect = createElement("select", "part-topic-select part-joint-topic");
    jointSelect.disabled = !state.ros;
    jointSelect.addEventListener("change", () => {
      part.jointStateTopicName = jointSelect.value;
      subscribePartTopics(part);
      updateCurrentConfigText();
    });

    card.append(
      header,
      createLabel("Description", descriptionSelect),
      createLabel("Joint states", jointSelect),
    );
    elements.partList.appendChild(card);
  });
}

function renderMountControls() {
  elements.mountList.replaceChildren();

  if (state.mounts.length === 0) {
    elements.mountList.appendChild(
      createElement("p", "empty-note", "No browser-side mounts in this preset."),
    );
    return;
  }

  state.mounts.forEach((mount) => {
    const card = createElement("article", "mount-card");
    card.dataset.mountId = mount.id;
    card.appendChild(createElement("div", "card-heading", mount.id));

    const mountGrid = createElement("div", "mount-grid");
    [
      ["x", "xyz", 0, false],
      ["y", "xyz", 1, false],
      ["z", "xyz", 2, false],
      ["roll", "rpy", 0, true],
      ["pitch", "rpy", 1, true],
      ["yaw", "rpy", 2, true],
    ].forEach(([labelText, key, index, degrees]) => {
      const input = document.createElement("input");
      input.className = "offset-input";
      input.type = "number";
      input.step = degrees ? "0.1" : "0.001";
      const slider = document.createElement("input");
      slider.className = "offset-slider";
      slider.type = "range";
      slider.step = input.step;
      slider.min = degrees ? "-180" : "-0.2";
      slider.max = degrees ? "180" : "0.2";
      syncOffsetControls(input, slider, mount.origin[key][index], degrees);

      input.addEventListener("input", () => {
        const value = Number.parseFloat(input.value);
        if (!Number.isFinite(value)) {
          return;
        }

        mount.origin[key][index] = degreesToStoredValue(value, degrees);
        slider.value = `${value}`;
        updateMountTransforms();
        updateCurrentConfigText();
      });
      input.addEventListener("blur", () => {
        const value = normalizeOffsetInput(input, slider, degrees);
        mount.origin[key][index] = degreesToStoredValue(value, degrees);
        updateMountTransforms();
        updateCurrentConfigText();
      });
      slider.addEventListener("input", () => {
        const value = Number.parseFloat(slider.value);
        mount.origin[key][index] = degreesToStoredValue(value, degrees);
        input.value = formatOffsetValue(mount.origin[key][index], degrees);
        updateMountTransforms();
        updateCurrentConfigText();
      });

      const label = document.createElement("label");
      label.append(labelText, input, slider);
      mountGrid.appendChild(label);
    });

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "compact-button";
    resetButton.textContent = "Reset offset";
    resetButton.addEventListener("click", () => {
      mount.origin = cloneOrigin(mount.initialOrigin);
      renderMountControls();
      updateMountTransforms();
      updateCurrentConfigText();
    });

    const status = createElement("dd", "mount-status", "waiting");

    card.append(
      createReadonlyField("Parent", mount.parentPartId),
      createReadonlyField("Child", mount.childPartId),
      mountGrid,
      resetButton,
      status,
    );
    elements.mountList.appendChild(card);
  });
}

function populateTopicSelects() {
  const descriptionTopics = chooseDescriptionTopics(state.discoveredTopics);
  const jointStateTopics = chooseJointStateTopics(state.discoveredTopics);

  state.parts.forEach((part) => {
    const card = partControlRoot(part.id);
    if (!card) {
      return;
    }

    const descriptionSelect = card.querySelector(".part-description-topic");
    const jointSelect = card.querySelector(".part-joint-topic");
    const previousDescriptionTopic = part.descriptionTopicName;
    const previousJointStateTopic = part.jointStateTopicName;
    const descriptionSelection = selectTopicForPart(
      descriptionTopics,
      part.descriptionTopicName,
      descriptionSelect.value,
      part.topicCandidates.descriptions,
    );
    const jointSelection = selectTopicForPart(
      jointStateTopics,
      part.jointStateTopicName,
      jointSelect.value,
      part.topicCandidates.joints,
    );
    const allowDescriptionFallback = part.topicCandidates.descriptions.length === 0;
    const allowJointFallback = part.topicCandidates.joints.length === 0;

    setSelectOptions(
      descriptionSelect,
      descriptionTopics,
      "No robot_description topics found",
      descriptionSelection,
      allowDescriptionFallback,
    );
    setSelectOptions(
      jointSelect,
      jointStateTopics,
      "No joint state topics found",
      jointSelection,
      allowJointFallback,
    );

    part.descriptionTopicName =
      descriptionTopics.length > 0 ? descriptionSelect.value : previousDescriptionTopic;
    part.jointStateTopicName =
      jointStateTopics.length > 0 ? jointSelect.value : previousJointStateTopic;
  });

  if (descriptionTopics.length === 0) {
    setStatus(elements.urdfStatus, "no description topic", "error");
  } else {
    updateGlobalStatuses();
  }
}

function updatePartStatuses() {}

function updateGlobalStatuses() {
  const parts = Array.from(state.parts.values());
  const loadedCount = parts.filter((part) => part.robot).length;
  const jointUpdates = parts.reduce((sum, part) => sum + part.jointUpdates, 0);

  if (parts.length === 0) {
    setStatus(elements.urdfStatus, "waiting");
  } else if (loadedCount === parts.length) {
    setStatus(elements.urdfStatus, `${loadedCount}/${parts.length} loaded`, "online");
  } else if (loadedCount > 0) {
    setStatus(elements.urdfStatus, `${loadedCount}/${parts.length} loaded`, "warn");
  } else if (state.ros) {
    setStatus(elements.urdfStatus, "discovering", "warn");
  } else {
    setStatus(elements.urdfStatus, "waiting");
  }

  setStatus(
    elements.jointStatus,
    `${jointUpdates} updates`,
    jointUpdates > 0 ? "online" : "",
  );
}

function updateCurrentConfigText() {
  elements.configJson.value = JSON.stringify(assemblyConfigSnapshot(), null, 2);
}

function validateAssemblyConfig(rawConfig) {
  if (!rawConfig || !Array.isArray(rawConfig.parts)) {
    throw new Error("Configuration must contain a parts array.");
  }

  const partIds = new Set();
  rawConfig.parts.forEach((part) => {
    if (!part.id || partIds.has(part.id)) {
      throw new Error("Each part must have a unique id.");
    }
    partIds.add(part.id);
  });

  rawConfig.parts.forEach((part) => {
    (part.mounts || []).forEach((mount) => {
      if (!partIds.has(mount.childPartId)) {
        throw new Error("Mount child part ids must reference existing parts.");
      }
    });
  });

  (rawConfig.mounts || []).forEach((mount) => {
    if (!partIds.has(mount.parentPartId) || !partIds.has(mount.childPartId)) {
      throw new Error("Mount part ids must reference existing parts.");
    }
  });

  return cloneAssemblyConfig(rawConfig);
}

function applyAssemblyConfig(nextConfig) {
  const normalizedConfig = validateAssemblyConfig(nextConfig);
  unsubscribeTopics();
  clearAllRobots();
  state.parts = new Map();
  normalizedConfig.parts.forEach((part) => {
    state.parts.set(part.id, createPartRuntime(part));
  });
  state.mounts = normalizedConfig.mounts;

  renderPartControls();
  renderMountControls();
  populateTopicSelects();
  updateCurrentConfigText();
  updateGlobalStatuses();
  setConnectedUi(Boolean(state.ros));

  if (state.ros) {
    subscribeTopics();
  }
}

function assemblyConfigSnapshot() {
  return {
    parts: Array.from(state.parts.values()).map((part) => ({
      id: part.id,
      robotName: part.robotName,
      mountLink: part.mountLink,
      descriptionTopic: part.descriptionTopicName,
      jointStateTopic: part.jointStateTopicName,
      hiddenLinks: cloneStringArray(part.hiddenLinks),
      topicCandidates: cloneTopicCandidates(part.topicCandidates),
      mounts: state.mounts
        .filter((mount) => mount.parentPartId === part.id)
        .map(cloneNestedMountConfig),
    })),
  };
}

function applySelectedPreset() {
  const preset = assemblyPresets[elements.assemblyPreset.value];
  if (!preset) {
    return;
  }
  applyAssemblyConfig(preset);
}

function degreesToStoredValue(value, degrees) {
  return degrees ? THREE.MathUtils.degToRad(value) : value;
}

function radiansToDegrees(value) {
  return THREE.MathUtils.radToDeg(value || 0);
}

function formatOffsetValue(value, degrees) {
  return degrees
    ? radiansToDegrees(value).toFixed(3)
    : (value || 0).toFixed(4);
}

function syncOffsetControls(input, slider, value, degrees) {
  const displayValue = degrees ? radiansToDegrees(value) : value;
  input.value = formatOffsetValue(value, degrees);
  slider.value = `${displayValue || 0}`;
}

function normalizeOffsetInput(input, slider, degrees) {
  if (input.value.trim() === "") {
    syncOffsetControls(input, slider, 0, degrees);
    return 0;
  }

  const value = Number.parseFloat(input.value);
  if (!Number.isFinite(value)) {
    syncOffsetControls(input, slider, 0, degrees);
    return 0;
  }

  syncOffsetControls(input, slider, degreesToStoredValue(value, degrees), degrees);
  return value;
}

function originToMatrix(origin) {
  const xyz = origin?.xyz || [0, 0, 0];
  const rpy = origin?.rpy || [0, 0, 0];
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(xyz[0] || 0, xyz[1] || 0, xyz[2] || 0),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rpy[0] || 0, rpy[1] || 0, rpy[2] || 0, "XYZ"),
    ),
    new THREE.Vector3(1, 1, 1),
  );
  return matrix;
}

function setMountStatus(mount, text, className = "") {
  const card = mountControlRoot(mount.id);
  const status = card?.querySelector(".mount-status");
  if (status) {
    setStatus(status, text, className);
  }
}

function updateMountTransforms() {
  state.parts.forEach((part) => {
    part.robot?.updateMatrixWorld(true);
  });

  state.mounts.forEach((mount) => {
    const parentPart = state.parts.get(mount.parentPartId);
    const childPart = state.parts.get(mount.childPartId);
    const parentRobot = parentPart?.robot;
    const childRobot = childPart?.robot;

    if (!parentRobot || !childRobot) {
      setMountStatus(mount, "waiting for URDFs", "warn");
      return;
    }

    const childMountLink = childPart.mountLink;
    const parentLink = parentRobot.links?.[mount.parentLink];
    const childLink = childMountLink ? childRobot.links?.[childMountLink] : null;
    if (!parentLink || !childLink) {
      setMountStatus(mount, "link not found", "error");
      return;
    }

    parentRobot.updateMatrixWorld(true);
    childRobot.updateMatrixWorld(true);

    const rootToChildLink = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().copy(childRobot.matrixWorld).invert(),
      childLink.matrixWorld,
    );
    const childLinkToRoot = new THREE.Matrix4().copy(rootToChildLink).invert();
    const finalMount = originToMatrix(mount.origin);
    const childRootWorld = new THREE.Matrix4()
      .copy(parentLink.matrixWorld)
      .multiply(finalMount)
      .multiply(childLinkToRoot);

    childRobot.matrixAutoUpdate = false;
    childRobot.matrix.copy(childRootWorld);
    childRobot.matrixWorldNeedsUpdate = true;
    childRobot.updateMatrixWorld(true);
    setMountStatus(mount, "mounted", "online");
  });
}

function applyPendingJointValues(part) {
  if (part.robot && part.pendingJointValues) {
    part.robot.setJointValues(part.pendingJointValues);
    part.pendingJointValues = null;
  }
}

function applyHiddenLinks(part) {
  if (!part.robot) {
    return;
  }

  part.hiddenLinks.forEach((linkName) => {
    const link = part.robot.links?.[linkName];
    if (link) {
      link.visible = false;
    }
  });
}

function robotNameFromUrdfXml(urdfXml) {
  const document = new DOMParser().parseFromString(urdfXml, "application/xml");
  return document.querySelector("robot")?.getAttribute("name") || "";
}

function robotNameMatches(part, robotName) {
  return !part.robotName || part.robotName === robotName;
}

function loadUrdfXmlForPart(part, urdfXml) {
  if (!urdfXml) {
    return;
  }

  const robotName = robotNameFromUrdfXml(urdfXml);
  if (!robotNameMatches(part, robotName)) {
    part.urdfStatus = "robot name mismatch";
    updatePartStatuses(part);
    updateGlobalStatuses();
    return;
  }

  if (urdfXml === part.latestUrdfXml) {
    return;
  }

  clearRobotDescriptionFallback(part);
  part.paramLookupInFlight = false;
  part.latestUrdfXml = urdfXml;
  clearPartRobot(part);
  part.urdfStatus = "loading";
  updatePartStatuses(part);
  updateGlobalStatuses();

  const manager = new THREE.LoadingManager();
  const loader = new URDFLoader(manager);
  loader.packages = packageBaseUrl;
  loader.parseVisual = true;
  loader.parseCollision = elements.collisionToggle.checked;

  manager.onLoad = () => {
    fitRobot();
    part.urdfStatus = `${Object.keys(part.robot?.links || {}).length} links`;
    updatePartStatuses(part);
    renderMountControls();
    updateMountTransforms();
    updateGlobalStatuses();
  };
  manager.onError = (url) => {
    console.error(`Mesh load failed: ${url}`);
    part.urdfStatus = "mesh error";
    updatePartStatuses(part);
    updateGlobalStatuses();
  };

  try {
    const robot = loader.parse(urdfXml);
    robot.name = `ROS2_URDF_${part.id}`;
    robot.matrixAutoUpdate = false;
    robot.matrix.identity();
    robot.updateMatrixWorld(true);
    assemblyRoot.add(robot);
    part.robot = robot;
    applyHiddenLinks(part);
    applyPendingJointValues(part);
    renderMountControls();
    updateMountTransforms();
    fitRobot();
  } catch (error) {
    console.error(error);
    part.urdfStatus = "parse error";
    updatePartStatuses(part);
    updateGlobalStatuses();
  }
}

function parseRosapiStringValue(response) {
  if (!response?.successful) {
    return "";
  }

  try {
    const value = JSON.parse(response.value);
    return typeof value === "string" ? value : "";
  } catch (error) {
    console.error("Failed to parse rosapi parameter value", error);
    return "";
  }
}

function tryLoadRobotDescriptionParam(part, publishers, index = 0) {
  if (publishers.length === 0) {
    part.paramLookupInFlight = false;
    if (!part.robot && part.descriptionTopicName) {
      part.urdfStatus = "no param publishers";
      updatePartStatuses(part);
      updateGlobalStatuses();
    }
    return;
  }

  if (
    !state.ros ||
    part.robot ||
    !part.paramLookupInFlight ||
    index >= publishers.length
  ) {
    part.paramLookupInFlight = false;
    if (!part.robot && part.descriptionTopicName) {
      part.urdfStatus = "param unavailable";
      updatePartStatuses(part);
      updateGlobalStatuses();
    }
    return;
  }

  const publisher = publishers[index];
  const getParamService = new ROSLIB.Service({
    ros: state.ros,
    name: "/rosapi/get_param",
    serviceType: "rosapi_msgs/GetParam",
  });

  getParamService.callService(
    new ROSLIB.ServiceRequest({
      name: `${publisher}:robot_description`,
      default_value: JSON.stringify(""),
    }),
    (response) => {
      const robotDescription = parseRosapiStringValue(response);
      if (robotDescription.includes("<robot")) {
        part.paramLookupInFlight = false;
        loadUrdfXmlForPart(part, robotDescription);
        return;
      }

      tryLoadRobotDescriptionParam(part, publishers, index + 1);
    },
    (error) => {
      console.error(`robot_description parameter lookup failed for ${publisher}`, error);
      tryLoadRobotDescriptionParam(part, publishers, index + 1);
    },
  );
}

function loadRobotDescriptionFromRosapiParams(part) {
  if (!state.ros || part.robot || part.paramLookupInFlight || !part.descriptionTopicName) {
    return;
  }

  part.paramLookupInFlight = true;
  part.urdfStatus = "loading from param";
  updatePartStatuses(part);
  updateGlobalStatuses();

  const requestRos = state.ros;
  const descriptionTopicName = part.descriptionTopicName;
  const publishersService = new ROSLIB.Service({
    ros: requestRos,
    name: "/rosapi/publishers",
    serviceType: "rosapi_msgs/Publishers",
  });

  publishersService.callService(
    new ROSLIB.ServiceRequest({ topic: descriptionTopicName }),
    (response) => {
      if (state.ros !== requestRos || part.descriptionTopicName !== descriptionTopicName) {
        part.paramLookupInFlight = false;
        return;
      }

      tryLoadRobotDescriptionParam(part, response.publishers || []);
    },
    (error) => {
      console.error(`robot_description publisher lookup failed for ${descriptionTopicName}`, error);
      part.paramLookupInFlight = false;
      if (!part.robot) {
        part.urdfStatus = "waiting for message";
        updatePartStatuses(part);
        updateGlobalStatuses();
      }
    },
  );
}

function scheduleRobotDescriptionFallback(part) {
  clearRobotDescriptionFallback(part);
  if (!state.ros || !part.descriptionTopicName || part.robot) {
    return;
  }

  part.urdfStatus = "param lookup queued";
  updatePartStatuses(part);
  updateGlobalStatuses();
  part.descriptionFallbackTimer = window.setTimeout(() => {
    part.descriptionFallbackTimer = null;
    if (!part.robot) {
      loadRobotDescriptionFromRosapiParams(part);
    }
  }, ROBOT_DESCRIPTION_FALLBACK_DELAY_MS);
}

function refreshTopics() {
  if (!state.ros || state.topicRefreshInFlight) {
    return;
  }

  const requestRos = state.ros;
  state.topicRefreshInFlight = true;
  if (Array.from(state.parts.values()).every((part) => !part.robot)) {
    setStatus(elements.urdfStatus, "discovering", "warn");
  }
  const topicsService = new ROSLIB.Service({
    ros: requestRos,
    name: "/rosapi/topics",
    serviceType: "rosapi_msgs/Topics",
  });

  topicsService.callService(
    new ROSLIB.ServiceRequest({}),
    (response) => {
      state.topicRefreshInFlight = false;
      if (state.ros !== requestRos) {
        return;
      }

      state.discoveredTopics = topicPairs(response);
      populateTopicSelects();
      subscribeTopics();
      state.parts.forEach((part) => {
        if (part.descriptionTopicName && !part.robot && !part.paramLookupInFlight) {
          loadRobotDescriptionFromRosapiParams(part);
        }
      });
      updateCurrentConfigText();
    },
    (error) => {
      state.topicRefreshInFlight = false;
      if (state.ros !== requestRos) {
        return;
      }

      console.error(error);
      setStatus(elements.urdfStatus, "rosapi error", "error");
      setStatus(elements.jointStatus, "rosapi error", "error");
    },
  );
}

function startTopicDiscovery() {
  stopTopicDiscovery();
  refreshTopics();
  state.topicRefreshTimer = window.setInterval(
    refreshTopics,
    TOPIC_REFRESH_INTERVAL_MS,
  );
}

function stopTopicDiscovery() {
  if (state.topicRefreshTimer) {
    window.clearInterval(state.topicRefreshTimer);
    state.topicRefreshTimer = null;
  }
  state.topicRefreshInFlight = false;
}

function handleJointState(part, message) {
  const values = {};
  const names = message.name || [];
  const positions = message.position || [];

  names.forEach((name, index) => {
    const value = positions[index];
    if (Number.isFinite(value)) {
      values[name] = value;
    }
  });

  part.jointUpdates += 1;
  part.jointStatus = `${part.jointUpdates} updates`;
  updatePartStatuses(part);
  updateGlobalStatuses();

  if (part.robot) {
    part.robot.setJointValues(values);
    part.robot.updateMatrixWorld(true);
    updateMountTransforms();
  } else {
    part.pendingJointValues = values;
  }
}

function unsubscribePartTopics(part) {
  clearRobotDescriptionFallback(part);
  part.paramLookupInFlight = false;
  if (part.descriptionTopic) {
    part.descriptionTopic.unsubscribe();
    part.descriptionTopic = null;
  }
  if (part.jointTopic) {
    part.jointTopic.unsubscribe();
    part.jointTopic = null;
  }
  part.subscribedDescriptionTopicName = "";
  part.subscribedJointTopicName = "";
}

function unsubscribeTopics() {
  state.parts.forEach(unsubscribePartTopics);
}

function subscribePartTopics(part) {
  if (!state.ros) {
    return;
  }

  const descriptionChanged =
    part.descriptionTopicName !== part.subscribedDescriptionTopicName;
  const jointChanged = part.jointStateTopicName !== part.subscribedJointTopicName;

  if (!descriptionChanged && !jointChanged) {
    return;
  }

  if (descriptionChanged) {
    if (part.descriptionTopic) {
      part.descriptionTopic.unsubscribe();
      part.descriptionTopic = null;
    }
    part.subscribedDescriptionTopicName = "";
    clearPartRobot(part);

    if (part.descriptionTopicName) {
      part.descriptionTopic = new ROSLIB.Topic({
        ros: state.ros,
        name: part.descriptionTopicName,
        messageType: "std_msgs/String",
      });
      part.descriptionTopic.subscribe((message) =>
        loadUrdfXmlForPart(part, message.data),
      );
      part.subscribedDescriptionTopicName = part.descriptionTopicName;
      part.urdfStatus = "subscribed";
      loadRobotDescriptionFromRosapiParams(part);
    }
  }

  if (jointChanged) {
    if (part.jointTopic) {
      part.jointTopic.unsubscribe();
      part.jointTopic = null;
    }
    part.subscribedJointTopicName = "";
    part.jointUpdates = 0;

    if (part.jointStateTopicName) {
      part.jointTopic = new ROSLIB.Topic({
        ros: state.ros,
        name: part.jointStateTopicName,
        messageType: "sensor_msgs/JointState",
        throttle_rate: 33,
      });
      part.jointTopic.subscribe((message) => handleJointState(part, message));
      part.subscribedJointTopicName = part.jointStateTopicName;
    }
  }

  if (!part.descriptionTopicName) {
    part.urdfStatus = "not selected";
  }
  part.jointStatus = part.jointStateTopicName ? "subscribed" : "not selected";
  updatePartStatuses(part);
  updateGlobalStatuses();
}

function subscribeTopics() {
  state.parts.forEach(subscribePartTopics);
}

function disconnectRos() {
  stopTopicDiscovery();
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

  const url = elements.rosbridgeUrl.value.trim() || rosbridgeEndpoint();
  const ros = new ROSLIB.Ros({ url });
  state.ros = ros;

  setStatus(elements.rosStatus, "connecting", "warn");
  setConnectedUi(true);

  ros.on("connection", () => {
    setStatus(elements.rosStatus, "online", "online");
    startTopicDiscovery();
  });
  ros.on("close", () => {
    stopTopicDiscovery();
    setStatus(elements.rosStatus, "offline");
    setConnectedUi(false);
  });
  ros.on("error", (error) => {
    stopTopicDiscovery();
    console.error(error);
    setStatus(elements.rosStatus, "error", "error");
    setConnectedUi(false);
  });
}

function reloadRobots() {
  state.parts.forEach((part) => {
    const urdfXml = part.latestUrdfXml;
    part.latestUrdfXml = "";
    if (urdfXml) {
      loadUrdfXmlForPart(part, urdfXml);
    } else {
      scheduleRobotDescriptionFallback(part);
    }
  });
}

function animate() {
  resizeRenderer();
  updateMountTransforms();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

async function initializeApp() {
  resetConnectionDefaults();
  await loadAssemblyPresets();
  setupRailResizer();
  renderPresetOptions();
  elements.assemblyPreset.value = assemblyPresets.single_robot
    ? "single_robot"
    : Object.keys(assemblyPresets)[0];
  applySelectedPreset();
  resetView();
  setConnectedUi(false);
  setStatus(elements.rosStatus, "offline");
  setStatus(elements.urdfStatus, "waiting");
  setStatus(elements.jointStatus, "0 updates");
  elements.gridToggle.addEventListener("change", () => {
    grid.visible = elements.gridToggle.checked;
  });
  elements.collisionToggle.addEventListener("change", reloadRobots);
  elements.connectButton.addEventListener("click", connectRos);
  elements.disconnectButton.addEventListener("click", disconnectRos);
  elements.reloadButton.addEventListener("click", reloadRobots);
  elements.fitButton.addEventListener("click", fitRobot);
  elements.resetViewButton.addEventListener("click", resetView);
  elements.assemblyPreset.addEventListener("change", applySelectedPreset);
  window.addEventListener("resize", handleWindowResize);
  window.lucide?.createIcons();

  animate();
}

initializeApp();
