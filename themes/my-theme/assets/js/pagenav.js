// single.html page navigation
document.addEventListener('DOMContentLoaded', function () {
    const pageNav = document.querySelector('.page-nav');
    console.log(pageNav.childElementCount);
    const isFirstPage = pageNav.firstElementChild.classList.contains('page-next')
    if (isFirstPage) {
        pageNav.classList.add('first-page');
    } else {
        pageNav.classList.remove('first-page');
    }

    const isLastPage = pageNav.childElementCount === 1 && pageNav.firstElementChild.classList.contains('page-prev')
    if (isLastPage) {
        pageNav.classList.add('last-page');
    } else {
        pageNav.classList.remove('last-page');
    }
});
