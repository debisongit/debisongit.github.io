// --- DYNAMIC SEASON & WEATHER ENGINE (Images) ---
async function setDynamicEnvironment() {
    const body = document.body;
    const bgContainer = document.getElementById('dynamic-bg-container');
    
    // 1. Determine Season
    const month = new Date().getMonth(); // 0 = Jan, 11 = Dec
    let season = 'winter'; // Default
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'autumn';
    
    // Apply Seasonal Vibe
    body.setAttribute('data-season', season);

    let weatherCondition = 'clear';

    try {
        // 2. Fetch current weather for Brussels (lat/lon)
        const lat = 50.8503;
        const lon = 4.3517;
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        
        // 3. Map codes to image terms
        const code = weatherData.current_weather.weathercode;
        if (code === 0 || code === 1) weatherCondition = 'sun';
        else if (code >= 2 && code <= 3) weatherCondition = 'cloudy';
        else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) weatherCondition = 'rain';
        else if (code >= 71 && code <= 77) weatherCondition = 'snow';
        else if (code >= 95 && code <= 99) weatherCondition = 'thunder';

    } catch (error) {
        console.warn("Weather fetch failed, falling back to default.", error);
    }

    // 4. Inject Image
    // Change 'jpg' to 'png' or 'webp' below if your images use a different format
    const imgExt = 'jpg'; 
    const imageFileName = `${season}-${weatherCondition}.${imgExt}`;
    const fallbackImage = `${season}.${imgExt}`;

    bgContainer.innerHTML = `
        <img src="assets/${imageFileName}" 
             onerror="this.onerror=null; this.src='assets/${fallbackImage}';" 
             alt="Dynamic Background">
        <div class="video-overlay"></div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Run Weather Engine
    setDynamicEnvironment();

    // 2. App Load Animation
    const appLayout = document.getElementById('app-layout');
    setTimeout(() => {
        appLayout.style.opacity = '1';
        appLayout.style.transform = 'translateY(0)';
    }, 100);

    // 3. UI Swipe Navigation
    const navBtns = document.querySelectorAll('.nav-btn');
    const swipeTrack = document.getElementById('swipe-track');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetPage = btn.getAttribute('data-target'); // 0 or 1
            swipeTrack.style.transform = `translateX(-${targetPage * 50}%)`;
        });
    });

    // 4. Music Player Controls
    const audio = document.getElementById('bg-music');
    const playPauseBtn = document.getElementById('play-pause');
    const playPauseIcon = playPauseBtn.querySelector('i');
    const volumeSlider = document.getElementById('volume-slider');
    const muteToggleBtn = document.getElementById('mute-toggle');
    const muteIcon = muteToggleBtn.querySelector('i');

    playPauseBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playPauseIcon.className = 'fas fa-pause';
        } else {
            audio.pause();
            playPauseIcon.className = 'fas fa-play';
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        audio.volume = e.target.value;
        if (audio.volume === 0) muteIcon.className = 'fas fa-volume-xmark';
        else if (audio.volume < 0.5) muteIcon.className = 'fas fa-volume-low';
        else muteIcon.className = 'fas fa-volume-high';
    });

    let prevVolume = 0.3;
    muteToggleBtn.addEventListener('click', () => {
        if (audio.volume > 0) {
            prevVolume = volumeSlider.value;
            audio.volume = 0; volumeSlider.value = 0;
            muteIcon.className = 'fas fa-volume-xmark';
        } else {
            audio.volume = prevVolume > 0 ? prevVolume : 0.3;
            volumeSlider.value = audio.volume;
            muteIcon.className = audio.volume < 0.5 ? 'fas fa-volume-low' : 'fas fa-volume-high';
        }
    });
});