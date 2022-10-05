import './style.css'
import { vec3, mat4 } from 'gl-matrix'
import Stats from 'stats.js'
import 'webgl-lint'

const vertex_source = `
#version 300 es

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec3 aColor;

uniform mat4 uMMatrix;
uniform mat4 uVMatrix;
uniform mat4 uPMatrix;

out vec4 vColor;
out vec4 vNormal;
out vec4 vPosition;

void main () {
  vec4 transformedPosition = uMMatrix * vec4(aPosition, 1);
  vec4 transformedNormal = uMMatrix * vec4(aNormal, 0);

  vColor = vec4(aColor.xyz, 1);
  vNormal = uVMatrix * transformedNormal;
  vPosition = uVMatrix * transformedPosition;

  gl_Position = uPMatrix * vPosition;
}
`.trim()

const fragment_source = `
#version 300 es
precision mediump float;

in vec4 vColor;
in vec4 vNormal;
in vec4 vPosition;

layout (location = 0) out vec4 outDiffuse;
layout (location = 1) out vec4 outNormal;
layout (location = 2) out vec4 outPosition;

void main () {
  outDiffuse = vec4(vColor.xyz, 1);

  outDiffuse.a = 1.0;

  outNormal = vec4(normalize(vNormal.xyz), 1);
  outPosition = vec4(vPosition.xyz, 1);
}
`.trim()


const vertex_source2 = `
#version 300 es

vec4 positions[] = vec4[4](
  vec4(-1,  1, 0, 1),
  vec4(-1, -1, 0, 1),
  vec4( 1,  1, 0, 1),
  vec4( 1, -1, 0, 1)
);

vec2 uvs[] = vec2[4](
  vec2(0, 1),
  vec2(0, 0),
  vec2(1, 1),
  vec2(1, 0)
);

out vec2 vUV;

void main () {
  gl_Position = positions[gl_VertexID % 4];
  vUV = uvs[gl_VertexID % 4];
}
`.trim()

const fragment_source2 = `
#version 300 es

precision mediump float;

in vec2 vUV;

uniform sampler2D uSampler;
uniform bool uIsSingleChannel;
uniform bool uUseLinear;
uniform float uNear;
uniform float uFar;

layout (location = 0) out vec4 outColor;

void main () {
  if (uIsSingleChannel) {
    float c = texture(uSampler, vUV).r;
    if (uUseLinear) {
      c = (2.0 * uNear) / (uFar + uNear - c * (uFar - uNear));
    }
    outColor = vec4(c, c, c, 1);
  } else {
    outColor = texture(uSampler, vUV);
  }
}
`.trim()

class RenderObject {
  constructor (gl, mesh, options) {
    this.options = { ...options }
    this.mesh = mesh
    this.mMatrix = mat4.create()

    this.vao = gl.createVertexArray()
    this.vbo = {}
    this.vbo['position'] = gl.createBuffer()
    this.vbo['normal'] = gl.createBuffer()
    this.vbo['color'] = gl.createBuffer()
    this.ebo = gl.createBuffer()

    gl.bindVertexArray(this.vao)

    // position

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo['position'])
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mesh.positions), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)

    // normal

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo['normal'])
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mesh.normals), gl.STATIC_DRAW)

    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)

    // color

    if (!this.options.color) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo['color'])
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.mesh.colors), gl.STATIC_DRAW)

      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0)
    } else {
      gl.disableVertexAttribArray(2)
      gl.vertexAttrib3fv(2, this.options.color)
    }

    // index

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(this.mesh.indices), gl.STATIC_DRAW)

    // cleanrup

    gl.bindVertexArray(null)

    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
  }

  render (gl, program, vMatrix, pMatrix) {
    if (!this.mesh.indices.length) {
      return
    }

    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uMMatrix'), false, this.mMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uVMatrix'), false, vMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uPMatrix'), false, pMatrix);

    gl.bindVertexArray(this.vao)
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_INT, 0)
    gl.bindVertexArray(null)
  }

  destroy (gl) {
    gl.deleteVertexArray(this.vao)
    gl.deleteBuffer(this.ebo)
    gl.deleteBuffer(this.vbo['position'])
    gl.deleteBuffer(this.vbo['normal'])
    gl.deleteBuffer(this.vbo['color'])
  }
}

const createBoxMesh = (s) => {
  const points = [
    [ -s,  s,  s, ],
    [ -s, -s,  s, ],
    [  s,  s,  s, ],
    [  s, -s,  s, ],

    [ -s,  s, -s, ],
    [ -s, -s, -s, ],
    [  s,  s, -s, ],
    [  s, -s, -s, ],
  ]

  const colors = [
    [ 1, 0, 0, ],
    [ 0, 1, 0, ],
    [ 0, 0, 1, ],
    [ 1, 1, 0, ],
    [ 0, 1, 1, ],
    [ 1, 0, 1, ],
  ]

  const normals = [
    // ftont
    [ 0, 0, 1, ],
    // right
    [ -1, 0, 0, ],
    // back
    [ 0, 0, -1, ],
    // right
    [ 1, 0, 0, ],
    // top
    [ 0, 1, 0, ],
    // bottom
    [ 0, -1, 0, ],
  ]

  const mesh = {
    positions: [
      // front
      ...points[0], ...points[1], ...points[2],
      ...points[2], ...points[1], ...points[3],
      // left
      ...points[4], ...points[5], ...points[0],
      ...points[0], ...points[5], ...points[1],
      // back
      ...points[6], ...points[7], ...points[4],
      ...points[4], ...points[7], ...points[5],
      // right
      ...points[2], ...points[3], ...points[6],
      ...points[6], ...points[3], ...points[7],
      // top
      ...points[4], ...points[0], ...points[6],
      ...points[6], ...points[0], ...points[2],
      // bottom
      ...points[1], ...points[5], ...points[3],
      ...points[3], ...points[5], ...points[7],
    ],
    normals: [
      // front
      ...normals[0], ...normals[0], ...normals[0],
      ...normals[0], ...normals[0], ...normals[0],
      // left
      ...normals[1], ...normals[1], ...normals[1],
      ...normals[1], ...normals[1], ...normals[1],
      // back
      ...normals[2], ...normals[2], ...normals[2],
      ...normals[2], ...normals[2], ...normals[2],
      // right
      ...normals[3], ...normals[3], ...normals[3],
      ...normals[3], ...normals[3], ...normals[3],
      // top
      ...normals[4], ...normals[4], ...normals[4],
      ...normals[4], ...normals[4], ...normals[4],
      // bottom
      ...normals[5], ...normals[5], ...normals[5],
      ...normals[5], ...normals[5], ...normals[5],
    ],
    colors: [
      // front
      ...colors[0], ...colors[0], ...colors[0],
      ...colors[0], ...colors[0], ...colors[0],
      // left
      ...colors[1], ...colors[1], ...colors[1],
      ...colors[1], ...colors[1], ...colors[1],
      // back
      ...colors[2], ...colors[2], ...colors[2],
      ...colors[2], ...colors[2], ...colors[2],
      // right
      ...colors[3], ...colors[3], ...colors[3],
      ...colors[3], ...colors[3], ...colors[3],
      // top
      ...colors[4], ...colors[4], ...colors[4],
      ...colors[4], ...colors[4], ...colors[4],
      // bottom
      ...colors[5], ...colors[5], ...colors[5],
      ...colors[5], ...colors[5], ...colors[5],
    ],
    indices: [
      // front
      0, 1, 2, 3, 4, 5,
      // left
      6, 7, 8, 9, 10, 11,
      // back
      12, 13, 14, 15, 16, 17,
      // right
      18, 19, 20, 21, 22, 23,
      // top
      24, 25, 26, 27, 28, 29,
      // bottom
      30, 31, 32, 33, 34, 35,
    ],
  }

  return mesh
}

const createFloorMesh = (s) => {
  return {
    positions: [
      -s, 0, -s,
      -s, 0,  s,
       s, 0, -s,
       s, 0,  s,
    ],
    colors: [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
      1, 1, 0,
    ],
    normals: [
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ],
    indices: [
      0, 1, 2, 3, 2, 1
    ],
  }
}

const createFramebuffer = (gl) => {
  const canvas = gl.canvas

  const framebuffer = gl.createFramebuffer()

  const diffuseBuf = gl.createTexture()
  const normalBuf = gl.createTexture()
  const positionBuf = gl.createTexture()
  const depthBuf = gl.createTexture()

  const setupTexture = (gl, texture, internalFormat, width, height, format, type) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)

  setupTexture(gl, diffuseBuf, gl.RGBA32F, canvas.width, canvas.height, gl.RGBA, gl.FLOAT)
  setupTexture(gl, normalBuf, gl.RGBA32F, canvas.width, canvas.height, gl.RGBA, gl.FLOAT)
  setupTexture(gl, positionBuf, gl.RGBA32F, canvas.width, canvas.height, gl.RGBA, gl.FLOAT)

  gl.bindTexture(gl.TEXTURE_2D, depthBuf);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, canvas.width, canvas.height, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);  

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, diffuseBuf, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalBuf, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, positionBuf, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthBuf, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null);

  const capture = (cb) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2])

    cb()

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const destroy = (gl) => {
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(diffuseBuf)
    gl.deleteTexture(normalBuf)
    gl.deleteTexture(positionBuf)
    gl.deleteTexture(depthBuf)
  }

  return {
    framebuffer,
    diffuseBuf,
    normalBuf,
    positionBuf,
    depthBuf,
    capture,
    destroy,
  }
}

window.onload = () => {
  var stats = new Stats()
  stats.showPanel(0)
  document.body.appendChild(stats.dom)

  const width = 640
  const height = 480
  const aspect = width/height
  const canvas = document.getElementById('screen')

  canvas.width = width
  canvas.height = height
  canvas.style.width = width + 'px'
  canvas.style.height = height + 'px'

  const gl = canvas.getContext('webgl2')

  gl.getExtension('EXT_color_buffer_float')
  const gman = gl.getExtension('GMAN_debug_helper')

  gman.disable()

  const program = createProgram(gl, vertex_source, fragment_source)
  const program2 = createProgram(gl, vertex_source2, fragment_source2)

  const vMatrix = mat4.create()
  const pMatrix = mat4.create()

  const objects = []

  const floor = new RenderObject(gl, createFloorMesh(1.8), { color: [0.6, 0.6, 0.6] })
  mat4.translate(floor.mMatrix, floor.mMatrix, [0, -0.5, 0])

  const box = new RenderObject(gl, createBoxMesh(0.4))
  mat4.translate(box.mMatrix, box.mMatrix, [0, -0.1, 0])

  objects.push(floor)
  objects.push(box)

  if (1) {
    for (let i = 0; i < 6; i++) {
      const object = new RenderObject(gl, createBoxMesh(Math.random() * 0.32))
      mat4.translate(object.mMatrix, object.mMatrix, [
        Math.random() * 1.8 - 0.9,
        Math.random() * 1.4 - 0.7,
        0,
      ])
      mat4.rotateZ(object.mMatrix, object.mMatrix, Math.random() * Math.PI * 2)
      //mat4.rotateX(object.mMatrix, object.mMatrix, Math.random() * Math.PI * 2)
      mat4.rotateY(object.mMatrix, object.mMatrix, Math.random() * Math.PI * 2)
      objects.push(object)
    }
  }

  const fb = createFramebuffer(gl)

  const near = 0.8
  const far = 100.0

  const renderGeometry = (near, far) => {
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0.1, 0.1, 0.1, 1)
    gl.clearDepth(1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    mat4.perspective(pMatrix, Math.PI/180*60, aspect, near, far)
    mat4.lookAt(vMatrix, [0, 0.5, 2.2], [0, 0, 0], [0, 1, 0])

    gl.useProgram(program)

    objects.forEach((object) => {
      if ((object != floor)) {
        mat4.rotateY(object.mMatrix, object.mMatrix, radians(0.4))
        mat4.rotateZ(object.mMatrix, object.mMatrix, radians(0.25))
        mat4.rotateX(object.mMatrix, object.mMatrix, radians(0.6))
      }
      object.render(gl, program, vMatrix, pMatrix)
    })
  }

  const renderTexture = (texture, isSingleChannel, useLinear) => {
    gl.useProgram(program2)

    gl.uniform1i(gl.getUniformLocation(program2, 'uSampler'), 0)
    gl.uniform1i(gl.getUniformLocation(program2, 'uIsSingleChannel'), isSingleChannel)
    gl.uniform1i(gl.getUniformLocation(program2, 'uUseLinear'), useLinear)
    gl.uniform1f(gl.getUniformLocation(program2, 'uNear'), near)
    gl.uniform1f(gl.getUniformLocation(program2, 'uFar'), far)

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  const render = () => {
    // render geometry

    if (0) {
      renderGeometry(near, far)
    } else {
      fb.capture(() => renderGeometry(near, far))

      // render frame

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.CULL_FACE)
      gl.clearColor(0, 0, 0, 1)
      gl.clearDepth(1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const w = (width/4)/2
      const h = w*(height/width)

      gl.viewport(w*0, canvas.height - h, w, h)
      renderTexture(fb.diffuseBuf, false, false)

      gl.viewport(w*1, canvas.height - h, w, h)
      renderTexture(fb.normalBuf, false, false)

      gl.viewport(w*2, canvas.height - h, w, h)
      renderTexture(fb.positionBuf, false, false)

      gl.viewport(w*3, canvas.height - h, w, h)
      renderTexture(fb.depthBuf, true, false)

      // render final results

      gl.viewport(0, 0, canvas.width, canvas.height)
      renderTexture(fb.diffuseBuf, false, false)
    }
  }

  let request = null

  const loop = () => {
    try {
      stats.begin()
      render()
      stats.end()
      request = requestAnimationFrame(loop)
    } catch (err) {
      console.error(err)
    }
  }

  window.onbeforeunload = () => {
    cancelAnimationFrame(request)
    objects.forEach((object) => object.destroy(gl))
    fb.destroy(gl)
    gl.deleteProgram(program)
    gl.deleteProgram(program2)
    window.onbeforeunload = null
  }

  request = requestAnimationFrame(loop)
}

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

const createVertexShader = (gl, source) => createShader(gl, gl.VERTEX_SHADER, source)

const createFragmentShader = (gl, source) => createShader(gl, gl.FRAGMENT_SHADER, source)

const createProgram = (gl, vsSource, fsSource) => {
  const program = gl.createProgram()
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.detachShader(program, vs)
  gl.detachShader(program, fs)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return program
}

const radians = (degrees) => Math.PI/180*degrees
