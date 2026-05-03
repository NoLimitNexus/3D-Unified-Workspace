import * as THREE from 'three';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({ antialias: true });

export const envGroup = new THREE.Group();
scene.add(envGroup);

export let character = null;
export function setCharacter(c) { character = c; }

export const clock = new THREE.Clock();
