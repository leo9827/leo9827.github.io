(() => {
  // <stdin>
  document.addEventListener("DOMContentLoaded", () => {
    const topButton = document.getElementById("top-link");
    window.addEventListener("scroll", () => {
      if (window.scrollY > 400) {
        topButton.style.visibility = "visible";
        topButton.style.opacity = "1";
      } else {
        topButton.style.visibility = "hidden";
        topButton.style.opacity = "0";
      }
    });
    topButton.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  });
})();
