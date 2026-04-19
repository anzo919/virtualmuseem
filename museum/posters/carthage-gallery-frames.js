// ============================================
// MUSEUM FRAMES - Carthage Art Gallery
// Three.js Wall-Mounted Picture Frames
// Drop this into your scene setup
// ============================================

class MuseumFrame {
    constructor(scene, position, rotation, imageUrl, options = {}) {
        this.scene = scene;
        this.position = position;
        this.rotation = rotation;
        this.imageUrl = imageUrl;
        this.width = options.width || 4;
        this.height = options.height || 3;
        this.frameColor = options.frameColor || 0x8b6914;
        this.frameThickness = options.frameThickness || 0.15;
        this.frameDepth = options.frameDepth || 0.2;
        
        this.group = new THREE.Group();
        this.createFrame();
        this.createCanvas();
        this.createLighting();
        this.positionFrame();
        
        scene.add(this.group);
    }
    
    createFrame() {
        const frameMat = new THREE.MeshStandardMaterial({
            color: this.frameColor,
            roughness: 0.3,
            metalness: 0.6,
            envMapIntensity: 1
        });
        
        // Outer frame pieces
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(this.width + this.frameThickness*2, this.frameThickness, this.frameDepth),
            frameMat
        );
        top.position.y = this.height/2 + this.frameThickness/2;
        top.castShadow = true;
        this.group.add(top);
        
        const bottom = new THREE.Mesh(
            new THREE.BoxGeometry(this.width + this.frameThickness*2, this.frameThickness, this.frameDepth),
            frameMat
        );
        bottom.position.y = -this.height/2 - this.frameThickness/2;
        bottom.castShadow = true;
        this.group.add(bottom);
        
        const left = new THREE.Mesh(
            new THREE.BoxGeometry(this.frameThickness, this.height, this.frameDepth),
            frameMat
        );
        left.position.x = -this.width/2 - this.frameThickness/2;
        left.castShadow = true;
        this.group.add(left);
        
        const right = new THREE.Mesh(
            new THREE.BoxGeometry(this.frameThickness, this.height, this.frameDepth),
            frameMat
        );
        right.position.x = this.width/2 + this.frameThickness/2;
        right.castShadow = true;
        this.group.add(right);
        
        // Inner bevel (decorative molding)
        const bevelGeo = new THREE.BoxGeometry(this.width + 0.05, this.height + 0.05, 0.05);
        const bevelMat = new THREE.MeshStandardMaterial({
            color: 0xc4a882,
            roughness: 0.2,
            metalness: 0.8
        });
        const bevel = new THREE.Mesh(bevelGeo, bevelMat);
        bevel.position.z = this.frameDepth/2 - 0.02;
        this.group.add(bevel);
        
        // Backing board
        const backGeo = new THREE.BoxGeometry(this.width, this.height, 0.05);
        const backMat = new THREE.MeshStandardMaterial({ color: 0x1a1814 });
        const back = new THREE.Mesh(backGeo, backMat);
        back.position.z = -0.05;
        this.group.add(back);
    }
    
    createCanvas() {
        const loader = new THREE.TextureLoader();
        const canvasGeo = new THREE.PlaneGeometry(this.width - 0.1, this.height - 0.1);
        
        // Placeholder material while loading
        const placeholderMat = new THREE.MeshStandardMaterial({
            color: 0x2c2416,
            roughness: 0.9
        });
        
        this.canvas = new THREE.Mesh(canvasGeo, placeholderMat);
        this.canvas.position.z = this.frameDepth/2 + 0.01;
        this.group.add(this.canvas);
        
        // Load actual image
        loader.load(this.imageUrl, (texture) => {
            texture.encoding = THREE.sRGBEncoding;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            
            const imageMat = new THREE.MeshStandardMaterial({
                map: texture,
                roughness: 0.8,
                metalness: 0.0,
                emissive: 0xffffff,
                emissiveMap: texture,
                emissiveIntensity: 0.1
            });
            
            this.canvas.material = imageMat;
        }, undefined, (err) => {
            console.warn('Failed to load texture:', this.imageUrl);
        });
    }
    
    createLighting() {
        // Picture light (spotlight from above)
        this.spotLight = new THREE.SpotLight(0xfff5e6, 1.5, 15, Math.PI/6, 0.5, 1);
        this.spotLight.position.set(0, this.height/2 + 1, 2);
        this.spotLight.target = this.canvas;
        this.spotLight.castShadow = true;
        this.spotLight.shadow.mapSize.width = 512;
        this.spotLight.shadow.mapSize.height = 512;
        this.group.add(this.spotLight);
        
        // Subtle rim light
        this.rimLight = new THREE.PointLight(0xffddaa, 0.3, 5);
        this.rimLight.position.set(0, 0, 1.5);
        this.group.add(this.rimLight);
    }
    
    positionFrame() {
        this.group.position.set(...this.position);
        this.group.rotation.set(...this.rotation);
    }
    
    // Call this in your animation loop for subtle effects
    animate(time) {
        // Subtle breathing effect on light intensity
        if (this.spotLight) {
            this.spotLight.intensity = 1.5 + Math.sin(time * 2) * 0.1;
        }
    }
}

// ============================================
// GALLERY SETUP - Carthage Collection
// ============================================

const CarthageGallery = {
    frames: [],
    
    init(scene) {
        // Frame 1: Guerin - Dido and Aeneas (The Founding)
        this.frames.push(new MuseumFrame(
            scene,
            [-10, 3, -9.8],      // Position: left wall
            [0, Math.PI/2, 0],    // Rotation: facing right
            'https://upload.wikimedia.org/wikipedia/commons/8/82/Pierre-Narcisse_Gu%C3%A9rin_-_Dido_and_Aeneas_-_WGA10972.jpg',
            { width: 4, height: 3, frameColor: 0x6b4423 }
        ));
        
        // Frame 2: Turner - Hannibal Crossing the Alps
        this.frames.push(new MuseumFrame(
            scene,
            [0, 3, -9.8],         // Position: back wall center
            [0, 0, 0],            // Rotation: facing forward
            'https://media.tate.org.uk/art/images/work/N/N00/N00490_9.jpg',
            { width: 5, height: 3.2, frameColor: 0x4a3728 }
        ));
        
        // Frame 3: Tiepolo - The Capture of Carthage
        this.frames.push(new MuseumFrame(
            scene,
            [10, 3, -9.8],       // Position: right wall
            [0, -Math.PI/2, 0],   // Rotation: facing left
            'https://collectionapi.metmuseum.org/api/collection/v1/iiif/437795/800070/main-image',
            { width: 3.5, height: 4, frameColor: 0x5c4033 }
        ));
        
        // Frame 4: Carthage Harbor Reconstruction
        this.frames.push(new MuseumFrame(
            scene,
            [-10, 3, 9.8],       // Position: left wall (opposite)
            [0, Math.PI/2, 0],    // Rotation
            'https://cdnb.artstation.com/p/assets/images/images/086/146/039/large/marc-mons-a1.jpg?1742483885',
            { width: 4.5, height: 3, frameColor: 0x8b7355 }
        ));
        
        // Frame 5: Destruction of Carthage
        this.frames.push(new MuseumFrame(
            scene,
            [10, 3, 9.8],        // Position: right wall (opposite)
            [0, -Math.PI/2, 0],
            'https://cdn.historycollection.com/wp-content/uploads/2017/06/31235a8d59d5eed195b72c62aaa94a7f.jpg',
            { width: 4, height: 3.2, frameColor: 0x3a2818 }
        ));
        
        // Frame 6: Phoenician Ship (Maritime)
        this.frames.push(new MuseumFrame(
            scene,
            [0, 3, 9.8],         // Back wall (opposite)
            [0, Math.PI, 0],
            'https://www.worldhistory.org/uploads/images/4818.jpg',
            { width: 3.5, height: 2.5, frameColor: 0x6b5a3a }
        ));
        
        // Frame 7: Prado version - Dido and Aeneas (alternative)
        this.frames.push(new MuseumFrame(
            scene,
            [-5, 3, -9.8],       // Back wall left
            [0, 0, 0],
            'https://content3.cdnprado.net/imagenes/Documentos/imgsem/e1/e196/e1960c7c-2361-4766-adfa-d8f245b262fa/bab3123b-d255-4828-9ace-893dfcb06654_268.jpg',
            { width: 3.5, height: 2.8, frameColor: 0x7a5c3c }
        ));
        
        // Frame 8: Phoenician Fleet Engraving
        this.frames.push(new MuseumFrame(
            scene,
            [5, 3, -9.8],        // Back wall right
            [0, 0, 0],
            'https://media.gettyimages.com/id/1605136430/photo/old-engraved-illustration-of-phoenician-fleet-on-voyage-of-discovery-in-the-mediterranean-sea.jpg?s=612x612&w=gi&k=20&c=qgdhxkdFoOsxH0wVHHeRMlrWS78_Ai2x6GLi0M5A-xA=',
            { width: 3, height: 2.5, frameColor: 0x5a4a3a }
        ));
    },
    
    animate(time) {
        this.frames.forEach(frame => frame.animate(time));
    }
};

// ============================================
// WALL GENERATOR (if you need walls)
// ============================================

function createGalleryRoom(scene) {
    const wallMat = new THREE.MeshStandardMaterial({
        color: 0xf5f0e8,
        roughness: 0.9,
        metalness: 0.0
    });
    
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        roughness: 0.6,
        metalness: 0.1
    });
    
    // Floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        floorMat
    );
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 10),
        wallMat
    );
    backWall.position.set(0, 5, -10);
    backWall.receiveShadow = true;
    scene.add(backWall);
    
    // Front wall (with door opening)
    const frontWallLeft = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        wallMat
    );
    frontWallLeft.position.set(-10, 5, 10);
    frontWallLeft.rotation.y = Math.PI;
    scene.add(frontWallLeft);
    
    const frontWallRight = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        wallMat
    );
    frontWallRight.position.set(10, 5, 10);
    frontWallRight.rotation.y = Math.PI;
    scene.add(frontWallRight);
    
    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 10),
        wallMat
    );
    leftWall.position.set(-15, 5, 0);
    leftWall.rotation.y = Math.PI/2;
    leftWall.receiveShadow = true;
    scene.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 10),
        wallMat
    );
    rightWall.position.set(15, 5, 0);
    rightWall.rotation.y = -Math.PI/2;
    rightWall.receiveShadow = true;
    scene.add(rightWall);
    
    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
    );
    ceiling.position.y = 10;
    ceiling.rotation.x = Math.PI/2;
    scene.add(ceiling);
    
    // Ambient gallery lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const ceilingLight = new THREE.PointLight(0xfff5e6, 0.8, 20);
    ceilingLight.position.set(0, 9, 0);
    scene.add(ceilingLight);
}

// ============================================
// USAGE IN YOUR EXISTING CODE:
// ============================================
/*
// 1. After scene setup, call:
createGalleryRoom(scene);
CarthageGallery.init(scene);

// 2. In your animation loop:
function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;
    CarthageGallery.animate(time);
    // ... your other animation code
    renderer.render(scene, camera);
}
*/

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MuseumFrame, CarthageGallery, createGalleryRoom };
}